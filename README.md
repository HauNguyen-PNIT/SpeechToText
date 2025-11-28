# 🎙️ Speech-to-Text Platform

Real-time speech transcription with automatic speaker identification and AI summaries using OpenAI models.

---

## ✨ Features

- Live recording (microphone) with instant transcription  
- File upload: MP3, WAV, MP4, M4A, WebM  
- Speaker diarization and color-coded speaker labels  
- AI-generated conversation summaries  
- Auto light/dark theme support

---

## 🚀 Quick Start (Docker)

```bash
git clone https://github.com/yourusername/speech-to-text-platform.git
cd speech-to-text-platform

# Add OpenAI key
echo "OPENAI_API_KEY=your-openai-key" > .env

# Build and run
docker compose up --build

# Open http://localhost:8000
```

---

## 📋 Prerequisites

- Docker & Docker Compose (or Python 3.11 + node for local dev)  
- OpenAI API key

---

## 📁 Project structure

```
speech-to-text-platform/
├── backend/
│   ├── server.py
│   ├── realtime.py
│   ├── openai_client.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LiveTranscription.jsx
│   │   │   ├── FileTranscription.jsx
│   │   │   ├── TranscriptDisplay.jsx
|   |   |   └── Tabs.jsx
│   │   ├── App.jsx
│   │   └── styles.css
│   ├── index.html
│   └── package.json
├── Dockerfile
├── docker-compose.yml
└── .env
```

---

## 💻 Local development

Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Ensure FFmpeg is installed (brew/apt)
export OPENAI_API_KEY=your-openai-key
python server.py
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 📖 Usage

Live recording:
1. Open "Live Streaming" tab
2. Start recording, speak, stop & transcribe

File upload:
1. Open "File Upload" tab
2. Drag/drop or select audio file
3. View transcription with speaker labels and summary

---

## 🔌 API

POST /transcribe — upload audio
Request:
```bash
curl -X POST http://localhost:8000/transcribe \
    -F "file=@recording.mp3"
```
Response:
```json
{
    "text": "Full transcription...",
    "speakers": [{"speaker":"A","text":"Hello","start_time":0.5,"end_time":1.2}],
    "summary": "AI summary...",
    "duration": 45.2
}
```

GET /health
```bash
curl http://localhost:8000/health
```

---

## ⚙️ Configuration

.env:
```
OPENAI_API_KEY=your-openai-key
```
docker-compose environment:
```yaml
environment:
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    MAX_FILE_SIZE_MB: 25
    LOG_LEVEL: INFO
```

---

## 🧩 Key components (brief)

- server.py — FastAPI app and routes (/transcribe, /health, /ws/realtime)  
- realtime.py — WebSocket streaming handler  
- openai_client.py — OpenAI integration and diarization helpers  
- Frontend components handle recording, file upload, display, and waveform

---

## 🧩 Component Documentation

### Backend Components

#### `server.py`

Main FastAPI application containing all routes and business logic.

**Key Functions:**

##### `transcribe(file, merge_speakers)`

**Purpose:** Main transcription endpoint that processes uploaded audio files.

**Parameters:**
- `file`: UploadFile - Audio/video file to transcribe
- `merge_speakers`: str - "true" or "false" to enable speaker merging

**Returns:** Dictionary containing:
- `text`: Full transcription text
- `speakers`: Array of speaker segments
- `summary`: AI-generated summary
- `duration`: Audio duration in seconds
- `identified_speakers`: List of unique speakers

**Process Flow:**
1. Validates file format and size (max 25MB)
2. Saves file to temporary location
3. Converts MP3 to WAV if needed for compatibility
4. Sends to OpenAI `gpt-4o-transcribe-diarize` model
5. Extracts speaker segments from response
6. Applies speaker merging algorithm if enabled
7. Generates AI summary using GPT-4o-mini
8. Cleans up temporary files
9. Returns structured JSON response

**Error Handling:**
- HTTPException for validation errors (400)
- Catches OpenAI API errors
- Returns error object with empty data on failure
- Guarantees cleanup of temporary files

---

##### `transcribe_advanced(file, speaker_names, reference_files, merge_speakers)`

**Purpose:** Advanced transcription with speaker name identification using voice references.

**Parameters:**
- `file`: Main audio file to transcribe
- `speaker_names`: Comma-separated speaker names (e.g., "Alice,Bob")
- `reference_files`: Voice samples for each speaker (3-10 seconds each)
- `merge_speakers`: Enable speaker merging

**Returns:** Same as `transcribe()` but with identified speaker names instead of A, B, C

**Requirements:**
- Number of speaker names must match number of reference files
- Each reference file should contain clean speech sample
- Reference files must be in supported format

**Use Case:** When you know who the speakers are and have voice samples, this endpoint can label them by name instead of generic letters.

---

##### `merge_similar_speakers(speakers)`

**Purpose:** Detects over-segmentation and merges speakers that are likely the same person.

**Parameters:**
- `speakers`: Array of speaker segment dictionaries

**Returns:** Modified speakers list with merged segments

**Algorithm:**
1. Counts total speaker transitions in the transcript
2. Calculates transition rate (transitions / total segments)
3. If rate exceeds 40%, likely indicates single speaker over-segmented
4. Merges all speakers into "Speaker 1"
5. Logs decision with statistics for debugging

**Use Cases:**
- Single speaker with pauses between sentences
- Monologues or presentations
- Recordings with background noise causing false splits
- Vocal variations (tone/pitch changes) misidentified as new speaker

**Example Scenario:** 
- Input: Five segments alternating between A and B (80% transition rate)
- Output: All segments labeled as "Speaker 1"

---

##### `convert_to_wav(input_path)`

**Purpose:** Converts audio files (especially MP3) to WAV format for better compatibility.

**Parameters:**
- `input_path`: Path to source audio file

**Returns:** Path to converted WAV file

**Process:**
1. Loads audio file using pydub library
2. Exports as WAV with standard settings (16kHz, mono, PCM16)
3. Returns path to converted file

**Why This Matters:** Some MP3 encodings cause "corrupted or unsupported" errors with OpenAI API. WAV format is universally compatible and more reliable.

**Handles:**
- MP3 to WAV conversion
- Resampling to standard 16kHz
- Stereo to mono conversion
- Format normalization

---

##### `startup()`

**Purpose:** Application startup hook that mounts static files for the frontend.

**Process:**
1. Locates static directory containing built frontend
2. Verifies directory exists
3. Mounts StaticFiles middleware at root path
4. Logs success or failure for debugging

**Configuration:**
- Serves at root path for single-page application
- HTML mode enabled for proper routing
- Registered after API routes to avoid conflicts

---

#### `openai_client.py`

**Purpose:** Centralized OpenAI client creation and configuration.

**Features:**
- Reads API key from OPENAI_API_KEY environment variable
- Provides singleton pattern for client access
- Used by all transcription endpoints
- Handles authentication automatically

---

#### `realtime.py`

WebSocket handler for real-time streaming transcription (experimental feature).

##### `handle_realtime_websocket(ws)`

**Purpose:** Manages bidirectional WebSocket connection between browser and OpenAI Realtime API.

**Parameters:**
- `ws`: FastAPI WebSocket connection object

**Process:**
1. Accepts incoming WebSocket connection
2. Establishes connection to OpenAI Realtime API
3. Configures session with Whisper transcription enabled
4. Spawns two concurrent async tasks:
   - Browser to OpenAI: Forwards audio chunks
   - OpenAI to Browser: Forwards transcription events
5. Handles graceful shutdown on disconnect

**Features:**
- Audio format conversion (PCM16 to base64)
- Session configuration with Voice Activity Detection
- Real-time event filtering and logging
- Automatic cleanup on disconnect or error

**Events Handled:**
- `session.created`: Initial session established
- `session.updated`: Configuration applied successfully
- `input_audio_buffer.speech_started`: Speech detection triggered
- `input_audio_buffer.speech_stopped`: Speech ended
- `conversation.item.created`: Transcript segment available

**Limitations:** 
- Experimental feature, may have stability issues
- Requires stable WebSocket connection
- Higher latency than batch processing

---

### Frontend Components

#### `App.jsx`

Main application component providing overall layout and routing.

**State:**
- `activeTab`: Current tab selection ("live" or "file")

**Responsibilities:**
- Manages active tab state
- Renders application header with title and description
- Renders Tabs navigation component
- Conditionally renders either LiveTranscription or FileTranscription based on active tab
- Provides consistent footer across all views

**Structure:**
- Header section with branding
- Tab navigation bar
- Content area that changes based on selected tab
- Footer with attribution

---

#### `LiveTranscription.jsx`

Handles microphone recording and transcription from browser.

**State:**
- `isRecording`: Boolean indicating if currently recording
- `transcripts`: Array of transcript segments received
- `error`: Error message string for display
- `status`: Current operation status text
- `loading`: Processing flag during transcription

**Refs:**
- `mediaRecorderRef`: MediaRecorder instance for audio capture
- `audioChunksRef`: Array collecting recorded audio chunks
- `streamRef`: MediaStream object from microphone

---

**Key Functions:**

##### `startRecording()`

**Purpose:** Initializes and starts microphone recording.

**Process:**
1. Requests microphone access via browser API
2. Configures audio constraints (echo cancellation, noise suppression, 24kHz sample rate)
3. Creates MediaRecorder with WebM or MP4 format depending on browser support
4. Sets up data collection handler
5. Updates UI to show recording status
6. Starts audio capture

**Error Handling:**
- Permission denied: Shows user-friendly error message
- No microphone available: Alerts user to check hardware
- Browser not supported: Suggests alternative browsers

---

##### `stopRecording()`

**Purpose:** Stops recording and triggers transcription process.

**Process:**
1. Stops MediaRecorder instance
2. Waits for final audio chunks
3. Creates audio Blob from collected chunks
4. Builds FormData with audio file and parameters
5. POSTs to `/transcribe` endpoint
6. Waits for server response
7. Parses speaker segments from response
8. Updates transcripts state with new data
9. Stops all media tracks
10. Cleans up references

**Response Processing:**
- Maps speaker segments to display format
- Assigns unique IDs to each segment
- Preserves timestamps for display
- Groups data for TranscriptDisplay component

---

##### `clearTranscripts()`

**Purpose:** Resets transcript state to empty.

**Use Case:** Allows user to clear screen and start fresh recording.

---

**Component Features:**
- Real-time waveform visualization during recording
- Status updates at each step
- Loading spinner during processing
- Tips section for best recording practices
- Error display banner when issues occur
- Clear button when transcripts exist

---

#### `FileTranscription.jsx`

Manages file upload and displays transcription results.

**State:**
- `loading`: Upload/processing status flag
- `result`: Complete transcription result object
- `error`: Error message for display
- `useAdvanced`: Flag for advanced features
- `speakerNames`: User-entered speaker names
- `mergeSpeakers`: Toggle for automatic speaker merging

---

**Key Functions:**

##### `handleFileUpload(event)`

**Purpose:** Processes uploaded file and sends to backend.

**Process:**
1. Extracts file from input event
2. Validates file type and size
3. Creates FormData with file and configuration
4. Determines appropriate endpoint (basic or advanced)
5. Sends POST request to server
6. Monitors upload progress
7. Waits for transcription completion
8. Parses and validates response
9. Transforms data for display components
10. Updates UI with results

**Error Handling:**
- File too large: Shows size limit message
- Unsupported format: Lists supported formats
- Network error: Displays connection error
- API error: Shows specific error from server

**Supported Operations:**
- Drag and drop file upload
- Click to browse file system
- Multiple format support
- Progress indication
- Retry capability

---

##### `mergeAllSpeakers()`

**Purpose:** Manually merges all detected speakers into single speaker label.

**Use Case:** When automatic detection incorrectly splits single speaker, user can manually correct by merging all into one.

**Process:**
1. Iterates through all transcript segments
2. Changes all speaker labels to "Speaker 1"
3. Updates speaker count metadata
4. Refreshes display with merged data

---

**Component Features:**
- Drag and drop upload zone
- File format validation
- Advanced options panel (collapsible)
- Speaker merge toggle
- Speaker name input (for advanced mode)
- Reference file upload (for voice matching)
- Loading animation during processing
- Multiple result views (transcript, summary, full text)
- Manual merge button for corrections
- File metadata display (duration, speaker count)

---

#### `TranscriptDisplay.jsx`

Displays transcripts with color-coded speakers and formatting.

**Props:**
- `transcripts`: Array of transcript segment objects
- `title`: Optional display title
- `emptyMessage`: Message shown when no transcripts

**Features:**
- Color-coded speaker labels (6 unique colors)
- Timestamp formatting (MM:SS)
- Grouped consecutive same-speaker text
- Auto-scroll to latest transcript
- Responsive layout
- Empty state handling

---

**Key Functions:**

##### `groupConsecutiveSpeakers(transcripts)`

**Purpose:** Merges adjacent segments from the same speaker for cleaner display.

**Algorithm:**
1. Initializes first group with first transcript
2. Iterates through remaining transcripts
3. If speaker matches current group, appends text to existing group
4. If speaker differs, saves current group and starts new one
5. Maintains start time of first segment and end time of last segment
6. Returns array of grouped segments

**Benefits:**
- Reduces visual clutter
- Makes conversations easier to read
- Preserves all information while improving presentation
- Maintains timing accuracy

**Example:** Five short segments from Speaker A become one combined segment with merged text.

---

##### `getSpeakerColor(speaker)`

**Purpose:** Assigns consistent color to each speaker based on their name/label.

**Algorithm:**
1. Creates hash from speaker name using character codes
2. Uses bitwise operations for efficient hash calculation
3. Takes modulo of color array length to get index
4. Returns corresponding hex color code

**Benefits:**
- Same speaker always gets same color across sessions
- Different speakers get visually distinct colors
- Works with any speaker label format (A, B, Alice, Bob, etc.)
- No color conflicts between speakers

**Color Palette:**
- Speaker A: Blue (#4ea8de)
- Speaker B: Purple (#9d4edd)
- Speaker C: Orange (#faa307)
- Speaker D: Green (#38b000)
- Speaker E: Red (#e63946)
- Speaker F: Cyan (#06ffa5)

---

##### `formatTimestamp(seconds)`

**Purpose:** Converts seconds to human-readable MM:SS format.

**Behavior:**
- Handles null/undefined gracefully
- Rounds down to nearest second
- Pads seconds with leading zero
- Returns formatted string or null

**Examples:**
- 0 seconds → "0:00"
- 5.4 seconds → "0:05"
- 65 seconds → "1:05"
- 125.8 seconds → "2:05"

---

**Component Structure:**
- Container with optional title
- Empty state message when no data
- Scrollable transcript box
- Individual transcript bubbles for each speaker segment
- Each bubble contains:
  - Header with speaker name and timestamp
  - Text content with proper line wrapping
  - Color-coded left border

**Rendering Features:**
- Auto-scroll to bottom using refs and useEffect
- Smooth animations on new transcript appearance
- Responsive padding and sizing
- Accessible color contrast
- Mobile-optimized layout

---

#### `Waveform.jsx`

Real-time audio waveform visualizer using HTML5 Canvas.

**Props:**
- `isActive`: Boolean indicating whether to show active waveform

**Purpose:** Provides visual feedback during audio recording by displaying real-time waveform.

**Refs:**
- `canvasRef`: Reference to canvas DOM element for drawing

---

**Process:**
1. Activates when `isActive` prop becomes true
2. Requests microphone access from browser
3. Creates AudioContext for audio processing
4. Creates AnalyserNode for frequency analysis
5. Connects microphone stream to analyser
6. Reads time-domain audio data into buffer
7. Draws waveform on canvas element
8. Animates continuously using requestAnimationFrame
9. Cleans up resources when component unmounts or becomes inactive

**Canvas Drawing:**
- Dimensions: 600x150 pixels (responsive via CSS)
- Background: Uses CSS variable for theme compatibility
- Line style: 2px width, follows theme color
- Update rate: Approximately 60fps
- Data source: Real-time microphone input

**Audio Processing:**
- FFT size: 2048 samples for good resolution
- Buffer type: Uint8Array for memory efficiency
- Analysis: Time-domain data (waveform) not frequency
- Latency: Minimal for real-time feel

**Performance Considerations:**
- Uses requestAnimationFrame for smooth rendering
- Efficient buffer reuse (no reallocations)
- Automatic cleanup prevents memory leaks
- Canvas operations optimized for speed

**Visual Feedback:**
- Shows audio levels in real-time
- Helps user confirm microphone is working
- Indicates speech vs. silence visually
- Provides recording confidence

---

#### `Tabs.jsx`

Simple tab navigation component for switching between features.

**Props:**
- `active`: String ID of currently active tab
- `onChange`: Callback function when tab is clicked

**Tab Configuration:**
- Live Streaming tab (ID: "live"): Microphone recording feature
- File Upload tab (ID: "file"): File upload feature
- Each tab has icon, label, and unique identifier

---

**Features:**
- Visual active state with accent color border
- Click handlers for tab switching
- Icon and text label display
- Accessible with ARIA attributes
- Keyboard navigation support
- Smooth transitions between states

**CSS Classes:**
- Base tab button style for all tabs
- Active class for currently selected tab
- Hover state for better UX
- Focus state for keyboard navigation

**Accessibility:**
- ARIA labels for screen readers
- ARIA selected attribute for active state
- Native button elements for keyboard support
- Semantic HTML structure
- Focus management

**User Experience:**
- Clear visual indication of active tab
- Smooth hover effects
- Responsive to clicks and keyboard
- Consistent with overall design system

---

### Helper Functions and Utilities

#### Color Management

**CSS Variables System:**
All components use CSS custom properties for consistent theming:
- `--bg`: Background color (auto light/dark)
- `--fg`: Foreground/text color (auto light/dark)
- `--accent`: Primary accent color
- `--error`: Error message color
- `--success`: Success message color
- `--border`: Border color with transparency
- `--surface`: Surface/card background

**Benefits:**
- Automatic light/dark mode based on system preference
- Consistent colors across all components
- Easy theme customization through CSS
- Dynamic transparency using color-mix()
- No JavaScript theme switching needed

---

#### State Management Strategy

**Component-Level State:**
All state is managed locally within components using React hooks:

**useState for:**
- Simple values (strings, booleans, numbers)
- Arrays (transcript collections)
- Objects (results, configuration)
- UI state (loading, errors)

**useRef for:**
- DOM element references (canvas, input)
- MediaRecorder and audio instances
- Values that shouldn't trigger re-renders
- Mutable data that persists between renders

**useEffect for:**
- Side effects (audio processing, API calls)
- Cleanup operations (stopping streams, canceling animations)
- Dependency tracking for conditional execution
- Subscription management

**No Global State:**
- No Redux, MobX, or Context API needed
- Keeps code simple and components self-contained
- Easier to test individual components
- Better code splitting and lazy loading

---

#### Error Handling Patterns

**Backend Error Strategy:**
1. Try operation with proper exception catching
2. Log errors for debugging
3. Return structured error response
4. Always cleanup resources in finally block
5. Never expose sensitive information in errors

**Frontend Error Strategy:**
1. Try operation with async/await
2. Check HTTP response status
3. Check for error field in response data
4. Set error state for UI display
5. Log to console for debugging
6. Always cleanup in finally block
7. Show user-friendly error messages

**Consistent Pattern Benefits:**
- Predictable error handling across app
- Proper resource cleanup guaranteed
- User-friendly error messages
- Developer-friendly debugging info
- No silent failures

---

#### Performance Optimizations

**Backend Optimizations:**
- Temporary file cleanup guaranteed via finally blocks
- Async/await for non-blocking I/O operations
- Efficient file streaming for large files
- Format conversion only when necessary
- Connection pooling for OpenAI API

**Frontend Optimizations:**
- Lazy component loading (only active tab rendered)
- Debounced file validation before upload
- Proper cleanup of MediaRecorder and streams
- Canvas animation using requestAnimationFrame
- Efficient Blob handling for binary data
- Minimal re-renders through careful state design

**Memory Management:**
- All audio streams stopped when not needed
- Canvas animations canceled on unmount
- WebSocket connections properly closed
- Temporary files deleted after processing
- No memory leaks from event listeners

---

#### Accessibility Features

**Keyboard Navigation:**
- All interactive elements keyboard accessible
- Tab key navigation works properly
- Enter/Space key activates buttons
- Focus visible indicators
- Logical tab order

**Screen Reader Support:**
- ARIA labels on all interactive elements
- ARIA live regions for status updates
- Semantic HTML structure
- Alt text for icons
- Role attributes where needed

**Visual Accessibility:**
- High contrast color ratios
- Large click targets (44x44px minimum)
- Clear focus indicators
- Readable font sizes
- Color not sole indicator of meaning

**Audio Accessibility:**
- Visual waveform for hearing-impaired users
- Status text updates for screen readers
- Error messages in text form
- Progress indicators visible

---

#### Testing Considerations

**Component Design for Testing:**

**Backend:**
- Pure functions easy to unit test
- Dependency injection for mocks
- Async operations testable with async/await
- Clear input/output contracts
- Minimal side effects

**Frontend:**
- Components accept props for easy testing
- Hooks extractable for unit testing
- Event handlers testable in isolation
- Render output deterministic
- Minimal external dependencies

**Test Hooks:**
- Data-testid attributes for component queries
- Exposed functions for integration testing
- Mock-friendly API design
- Predictable state transitions

---

#### Browser Compatibility

**Supported Browsers:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Required APIs:**
- MediaRecorder API (audio recording)
- Web Audio API (waveform visualization)
- Fetch API (file uploads)
- Blob API (audio handling)
- Canvas API (visualization)

**Graceful Degradation:**
- Feature detection before use
- Fallback messages for unsupported browsers
- Progressive enhancement approach
- No critical features require latest APIs

---

#### Security Considerations

**Backend Security:**
- API key stored in environment variables
- No API key exposure in responses
- File size limits enforced (25MB)
- File type validation
- Temporary files immediately cleaned
- No persistent data storage
- CORS configured for specific origins

**Frontend Security:**
- No sensitive data in localStorage
- API key never in client code
- File validation before upload
- XSS protection via React escaping
- HTTPS required for production
- Microphone permission required

---

#### Extension Points

**Easy to Add:**
- New AI models (change model name in config)
- Additional file formats (add to SUPPORTED_FORMATS)
- Custom speaker colors (modify SPEAKER_COLORS array)
- New tab features (add to tabs array)
- Additional endpoints (follow existing pattern)
- Export formats (add export functions)

**Future Enhancements:**
- User authentication system
- Transcript history storage
- Export to various formats (TXT, JSON, SRT)
- Multi-language support
- Custom vocabulary/terminology
- Real-time collaboration
- Mobile native apps

---

## 🛠 Tech stack

Backend: Python 3.11, FastAPI, Pydub, FFmpeg  
Frontend: React, Vite  
AI: Whisper / GPT-4o family models  
Deployment: Docker, Docker Compose

---

## 🐛 Troubleshooting (common)

- Missing uvicorn: ensure in requirements.txt and rebuild Docker  
- Corrupted audio: convert to WAV, check FFmpeg installation  
- WebSocket failed: confirm dependencies and CORS settings

---

## 📊 Supported formats

- MP3, WAV, MP4, M4A, WebM — up to configured MAX_FILE_SIZE_MB (default 25 MB)

---

## 🔒 Security

- Store API keys in environment variables  
- Validate uploads and remove files after processing  
- Configure CORS and logging for production

---

## 🤝 Contributing

1. Fork, create branch, commit, push  
2. Open a pull request

---

## 📄 License & Acknowledgments

MIT License. Thanks to OpenAI, FastAPI, and React.

---

## 📞 Support

- Issues: https://github.com/yourusername/speech-to-text-platform/issues  
- Email: your-email@example.com

--- 

Made with ❤️ by Your Name
