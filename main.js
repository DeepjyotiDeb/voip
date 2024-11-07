class VoiceChatApp {
  constructor() {
    // WebSocket and recording variables
    this.socket = null;
    this.recorder = null;
    this.stream = null;
    this.videoRecorder = null;
    this.sessionTimer = null;
    this.isRecording = false;
    this.isSessionActive = false;

    // Screen recording variables
    this.screenStream = null;
    this.screenRecorder = null;
    this.isScreenRecording = false;
    this.combinedStream = null;

    // DOM Elements
    this.elements = {
      status: document.getElementById('status'),
      timer: document.getElementById('timer'),
      loadingSpinner: document.getElementById('loadingSpinner'),
      startButton: document.getElementById('startButton'),
      recordButton: document.getElementById('recordButton'),
      stopRecordingButton: document.getElementById('stopRecordingButton'),
      stopButton: document.getElementById('stopButton'),
      response: document.getElementById('response'),
      audioPlayback: document.getElementById('audioPlayback'),
      videoPreview: document.getElementById('videoPreview'),
    };

    // Bind methods to maintain context
    this.startSession = this.startSession.bind(this);
    this.endSession = this.endSession.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.startScreenRecording = this.startScreenRecording.bind(this);
    this.stopScreenRecording = this.stopScreenRecording.bind(this);

    // Initialize event listeners
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    this.elements.startButton.addEventListener('click', this.startSession);
    this.elements.stopRecordingButton.addEventListener('click', this.stopRecording);
    this.elements.stopButton.addEventListener('click', this.endSession);

    // Add audio playback ended listener to automatically start recording
    this.elements.audioPlayback.addEventListener('ended', () => {
      // Remove record button display and start recording automatically
      this.elements.recordButton.style.display = 'none';
      this.startRecording();
    });
  }

  async startSession() {
    try {
      // Initialize WebSocket connection
      //TODO
      this.socket = new WebSocket(`ws://${window.location.host}/ws/voice/`);
      this.socket.onmessage = this.handleMessage;
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateStatus('Connection error occurred');
      };
      this.socket.onclose = () => {
        if (this.isSessionActive) {
          this.updateStatus('Connection closed unexpectedly');
          this.endSession();
        }
      };

      // Wait for WebSocket to connect
      await new Promise((resolve, reject) => {
        this.socket.onopen = resolve;
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      // Initialize all media streams
      await this.initializeMediaStream();
      await this.startScreenRecording();

      // Update UI
      this.isSessionActive = true;
      this.elements.startButton.style.display = 'none';

      // this.elements.stopRecordingButton.style.display = 'inline-block';
      // this.elements.stopButton.style.display = 'inline-block';
      this.elements.stopRecordingButton.style.display = 'flex';
      this.elements.stopRecordingButton.style.flexDirection = 'column';
      this.elements.stopButton.style.display = 'flex';
      this.elements.stopButton.style.flexDirection = 'column';
      const responseBox = document.getElementById('response-box');
      responseBox.style.display = 'flex';
      this.updateStatus('Session started - Recording automatically');

      // Start session timer (5 minutes)
      this.startTimer(35 * 60);

      // Start recording automatically
      this.startRecording();
    } catch (error) {
      console.error('Error starting session:', error);
      this.updateStatus('Failed to start session: ' + error.message);
    }
  }

  async initializeMediaStream() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      this.elements.videoPreview.srcObject = this.stream;

      // Initialize video recording
      this.videoRecorder = new RecordRTC(this.stream, {
        type: 'video',
        mimeType: 'video/webm',
        bitsPerSecond: 128000,
      });
      this.videoRecorder.startRecording();
    } catch (error) {
      throw new Error('Failed to access media devices: ' + error.message);
    }
  }

  async startScreenRecording() {
    try {
      // Get screen sharing stream with system audio
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          systemAudio: 'include',
        },
      });

      // Get user audio stream
      const userAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
        },
        video: false,
      });

      // Create new MediaStream for combined audio
      const combinedAudioStream = new MediaStream();

      // Add system audio if available
      const systemAudioTrack = this.screenStream.getAudioTracks()[0];
      if (systemAudioTrack) {
        combinedAudioStream.addTrack(systemAudioTrack);
      }

      // Add user audio
      const userAudioTrack = userAudioStream.getAudioTracks()[0];
      if (userAudioTrack) {
        combinedAudioStream.addTrack(userAudioTrack);
      }

      // Create final combined stream with video and all audio
      this.combinedStream = new MediaStream([
        this.screenStream.getVideoTracks()[0],
        ...combinedAudioStream.getTracks(),
      ]);

      // Initialize screen recording with combined stream
      this.screenRecorder = new RecordRTC(this.combinedStream, {
        type: 'video',
        mimeType: 'video/webm;codecs=vp8,opus',
        bitsPerSecond: 128000,
        video: {
          width: 1920,
          height: 1080,
        },
        numberOfAudioChannels: 2,
        recorderType: RecordRTC.MediaStreamRecorder,
        timeSlice: 1000,
        disableLogs: true,
      });

      this.screenRecorder.startRecording();
      this.isScreenRecording = true;
      console.log('Screen recording started with system and user audio');
    } catch (error) {
      console.error('Error starting screen recording:', error);
      this.updateStatus('Failed to start screen recording: ' + error.message);
    }
  }

  getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + '=') {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  async stopScreenRecording() {
    if (!this.isScreenRecording) return;

    return new Promise((resolve) => {
      this.screenRecorder.stopRecording(() => {
        const blob = this.screenRecorder.getBlob();
        // console.log('Blob type:', blob.type);
        // console.log('Blob size:', blob.size);
        //TODO
        this.uploadScreenRecordingToS3(blob, 'screen');

        this.saveRecording(blob, 'screen');

        // Stop all tracks from combined stream
        if (this.combinedStream) {
          this.combinedStream.getTracks().forEach((track) => track.stop());
        }

        // Stop screen sharing tracks
        if (this.screenStream) {
          this.screenStream.getTracks().forEach((track) => track.stop());
        }

        this.isScreenRecording = false;
        resolve();
      });
    });
  }

  startTimer(duration) {
    let remainingTime = duration;
    this.sessionTimer = setInterval(() => {
      const minutes = Math.floor(remainingTime / 60);
      const seconds = remainingTime % 60;

      this.elements.timer.textContent = `Time remaining: ${String(minutes).padStart(
        2,
        '0'
      )}:${String(seconds).padStart(2, '0')}`;

      if (--remainingTime < 0) {
        this.endSession();
      }
    }, 1000);
  }

  startRecording() {
    if (!this.isSessionActive || this.isRecording) return;

    this.isRecording = true;
    this.recorder = new RecordRTC(this.stream, {
      type: 'audio',
      mimeType: 'audio/wav',
      recorderType: RecordRTC.StereoAudioRecorder,
      desiredSampRate: 16000,
      numberOfAudioChannels: 1,
      bufferSize: 4096,
    });

    this.recorder.startRecording();

    // Update UI
    this.updateStatus('Recording...');
    this.elements.loadingSpinner.style.display = 'none';
    // this.elements.stopRecordingButton.style.display = 'inline-block';
    this.elements.stopRecordingButton.style.display = 'flex';
    this.elements.stopRecordingButton.style.flexDirection = 'column';

    // this creates a blinking effect on the logo
    document.getElementById('center-logo').classList.add('recording');
  }

  stopRecording() {
    if (!this.isRecording) return;

    return new Promise((resolve) => {
      this.isRecording = false;
      this.elements.stopRecordingButton.style.display = 'none';
      this.elements.loadingSpinner.style.display = 'flex';
      this.elements.loadingSpinner.style.flexDirection = 'column';
      document.getElementById('center-logo').classList.remove('recording');

      this.recorder.stopRecording(() => {
        const audioBlob = this.recorder.getBlob();
        this.sendAudioToServer(audioBlob);
        this.updateStatus('Processing...');

        // stops the blinking effect on the logo
        document.getElementById('center-logo').classList.remove('recording');

        resolve();
      });
    });
  }

  sendAudioToServer(audioBlob) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(audioBlob);
    } else {
      this.updateStatus('Connection lost. Please restart the session.');
    }
  }

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      // Update response text if available
      if (data.text) {
        this.elements.response.textContent = data.text;
      }

      // Play audio response if available
      if (data.audio) {
        const audioBlob = this.base64ToBlob(data.audio, 'audio/mp3');
        this.playAudioResponse(audioBlob);

        // Hide loading spinner and record button
        this.elements.loadingSpinner.style.display = 'none';
        this.elements.recordButton.style.display = 'none';
        this.updateStatus('Playing response...');
      }
      console.log(data.text);
      if (data.text.toLowerCase().includes('interview complete')) {
        console.log('Interview complete detected, waiting for audio to finish...');
        this.elements.audioPlayback.addEventListener(
          'ended',
          () => {
            console.log('Audio finished, ending session...');
            this.endSession();
          },
          { once: true }
        ); // Use once:true to ensure the listener is removed after execution
      }
    } catch (error) {
      console.error('Error handling message:', error);
      console.log('Raw response data:', event.data);
    }
  }

  playAudioResponse(audioBlob) {
    const audioUrl = URL.createObjectURL(audioBlob);
    this.elements.audioPlayback.src = audioUrl;
    this.elements.audioPlayback
      .play()
      .catch((error) => console.error('Error playing audio:', error));
  }

  base64ToBlob(base64Data, contentType) {
    const byteCharacters = atob(base64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);

      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      byteArrays.push(new Uint8Array(byteNumbers));
    }

    return new Blob(byteArrays, { type: contentType });
  }

  updateStatus(message) {
    this.elements.status.textContent = message;
  }

  async endSession() {
    try {
      // Immediately update status to "Session ended"
      this.updateStatus('Session ended');

      // Stop all timers and recordings
      clearInterval(this.sessionTimer);

      if (this.isRecording) {
        await this.stopRecording();
      }

      // Stop audio playback
      this.elements.audioPlayback.pause();
      this.elements.audioPlayback.currentTime = 0;

      // Stop video recording and save
      if (this.videoRecorder) {
        this.videoRecorder.stopRecording(() => {
          const blob = this.videoRecorder.getBlob();
          this.uploadRecordingToS3(blob, 'video');
          // this.saveRecording(blob, 'video');
        });
      }

      // Stop screen recording and save
      if (this.isScreenRecording) {
        await this.stopScreenRecording();
      }

      // Stop all media tracks
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }

      // Close WebSocket connection
      if (this.socket) {
        this.socket.close();
      }

      // Reset flags
      this.isSessionActive = false;
      this.isRecording = false;

      // Update UI
      this.elements.loadingSpinner.style.display = 'none';
      this.elements.stopButton.style.display = 'none';
      this.elements.stopRecordingButton.style.display = 'none';
      this.elements.startButton.style.display = 'flex';
      this.elements.startButton.style.flexDirection = 'column';
      this.elements.timer.textContent = '';
      this.elements.response.textContent = '';
    } catch (error) {
      console.error('Error ending session:', error);
      this.updateStatus('Error ending session: ' + error.message);
    }
  }

  saveRecording(blob, type) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${type}_recording_${new Date().toISOString()}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  uploadScreenRecordingToS3(blob, type) {
    const csrftoken = this.getCookie('csrftoken');
    const formData = new FormData();
    formData.append(type, blob, `${type}_recording.webm`);

    fetch('/upload_screen/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken,
      },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(`${type} uploaded successfully.`);
        // Handle the response, such as showing the URL or storing it somewhere
      })
      .catch((error) => {
        console.error(`Error uploading ${type}:`, error);
      });
  }

  uploadRecordingToS3(blob, type) {
    const csrftoken = this.getCookie('csrftoken');
    const formData = new FormData();
    formData.append(type, blob, `${type}_recording.webm`);

    fetch('/upload_video/', {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken,
      },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(`${type} uploaded successfully.`);
        // Handle the response, such as showing the URL or storing it somewhere
      })
      .catch((error) => {
        console.error(`Error uploading ${type}:`, error);
      });
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new VoiceChatApp();
});
