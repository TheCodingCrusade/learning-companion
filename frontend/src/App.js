import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://127.0.0.1:5000');

function App() {
  const [selectedFiles, setSelectedFiles] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'files_selected', 'uploading', 'transcribing', 'done', 'error'
  const [progress, setProgress] = useState(0);
  const [currentFileETA, setCurrentFileETA] = useState(0);
  const [displayedETA, setDisplayedETA] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Select video file(s) or drag and drop here.');
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [originalFilenames, setOriginalFilenames] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processingFileRef = useRef(false);
  const etaIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  const formatEta = (totalSeconds) => {
    if (totalSeconds <= 0) return "";
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    } else {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
    }
  };

  // Effect for ETA countdown
  useEffect(() => {
    if (status === 'transcribing' && currentFileETA > 0) {
      setDisplayedETA(currentFileETA);
      etaIntervalRef.current = setInterval(() => {
        setDisplayedETA(prev => Math.max(0, prev - 1));
      }, 1000);
    } else {
      clearInterval(etaIntervalRef.current);
      setDisplayedETA(0);
    }
    return () => clearInterval(etaIntervalRef.current);
  }, [currentFileETA, status]);

  // Socket event listeners
  useEffect(() => {
    socket.on('progress_update', (data) => {
      setStatus('transcribing');
      setStatusMessage(data.status);
      setProgress(data.progress);
      if (data.eta) {
        const etaSeconds = parseInt(data.eta.replace('s remaining', ''));
        setCurrentFileETA(etaSeconds);
      }
    });

    socket.on('transcription_complete', (data) => {
      clearInterval(etaIntervalRef.current);
      setDisplayedETA(0);

      if (isMultiFileMode && selectedFiles && currentFileIndex < selectedFiles.length) {
        const originalName = originalFilenames[currentFileIndex];
        handleDownload(data.transcript, originalName);
        processingFileRef.current = false;
        const nextIndex = currentFileIndex + 1;
        if (nextIndex < selectedFiles.length) {
          setCurrentFileIndex(nextIndex);
          setCurrentFileETA(0);
        } else {
          setStatus('done');
          setProgress(100);
          setStatusMessage(`All ${selectedFiles.length} files processed successfully!`);
        }
      } else {
        setCurrentTranscript(data.transcript);
        setStatus('done');
        setProgress(100);
        setStatusMessage('Transcription successful!');
        processingFileRef.current = false;
      }
    });

    socket.on('transcription_error', (data) => {
      clearInterval(etaIntervalRef.current);
      setDisplayedETA(0);
      setStatus('error');
      setProgress(0);
      setStatusMessage(`Error: ${data.error}`);
      processingFileRef.current = false;
      if (isMultiFileMode) {
        alert(`An error occurred processing ${originalFilenames[currentFileIndex] || 'a file'}. Please check console.`);
      }
    });

    return () => {
      socket.off('progress_update');
      socket.off('transcription_complete');
      socket.off('transcription_error');
      clearInterval(etaIntervalRef.current);
    };
  }, [isMultiFileMode, currentFileIndex, selectedFiles, originalFilenames]);

  // Effect for processing subsequent files in a multi-file batch
  useEffect(() => {
    if (isMultiFileMode && selectedFiles && currentFileIndex < selectedFiles.length && 
        status !== 'idle' && status !== 'files_selected' && // Ensure processing has been explicitly started
        !processingFileRef.current) {
      processFile(selectedFiles[currentFileIndex]);
    }
  }, [currentFileIndex, isMultiFileMode, selectedFiles, status]); // 'status' is important to react after handleStartProcessing sets it

  const resetToInitialState = () => {
    setSelectedFiles(null);
    setCurrentTranscript('');
    setStatus('idle');
    setProgress(0);
    setCurrentFileETA(0);
    setDisplayedETA(0);
    setStatusMessage('Select video file(s) or drag and drop here.');
    setIsMultiFileMode(false);
    setCurrentFileIndex(0);
    setOriginalFilenames([]);
    processingFileRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Clear the actual file input
    }
  };

  const handleFilesSelected = (files) => {
    if (files && files.length > 0) {
      resetToInitialState(); // Reset before setting new files
      setSelectedFiles(files);
      const names = Array.from(files).map(file => file.name);
      setOriginalFilenames(names);

      if (files.length > 1) {
        setIsMultiFileMode(true);
        setStatusMessage(`${files.length} files selected. Click "Transcribe Selected" to start.`);
      } else {
        setIsMultiFileMode(false);
        setStatusMessage(`1 file selected. Click "Transcribe Selected" to start.`);
      }
      setStatus('files_selected'); // New status to indicate files are ready but not processing
    }
  };

  const handleInputChange = (event) => {
    handleFilesSelected(event.target.files);
  };

  const processFile = async (fileToProcess) => {
    if (!fileToProcess || processingFileRef.current) return;

    processingFileRef.current = true;
    const formData = new FormData();
    formData.append('file', fileToProcess);

    const currentFileNameForUpload = originalFilenames[currentFileIndex] || fileToProcess.name;
    let overallProgressText = '';
    if (isMultiFileMode && selectedFiles) {
      overallProgressText = `(File ${currentFileIndex + 1} of ${selectedFiles.length}: ${currentFileNameForUpload}) `;
    }

    setStatus('uploading'); // This will now hide the drop zone
    setProgress(5);
    setStatusMessage(`${overallProgressText}Uploading file...`);
    setCurrentFileETA(0);

    try {
      const uploadResponse = await fetch('http://127.0.0.1:5000/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'File upload failed.');
      }
      const uploadData = await uploadResponse.json();
      const { video_path } = uploadData;
      setStatusMessage(`${overallProgressText}Upload complete. Starting transcription...`);
      setProgress(10);
      socket.emit('start_transcription', { video_path: video_path });
    } catch (error) {
      console.error('Error during file processing:', error);
      setStatus('error'); // This will show the reset button
      setStatusMessage(`Error processing ${currentFileNameForUpload}: ${error.message}`);
      setProgress(0);
      processingFileRef.current = false;
      // No automatic alert here, error message will be shown in status
    }
  };

  const handleStartProcessing = () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select file(s) first!');
      return;
    }
    setCurrentFileIndex(0); // Reset to start from the first file
    if (selectedFiles.length > 1) {
      setIsMultiFileMode(true);
    } else {
      setIsMultiFileMode(false);
    }
    // Manually start processing the first file.
    // Subsequent files are handled by the useEffect hook that watches currentFileIndex.
    processFile(selectedFiles[0]);
  };

  const handleDownload = (content, baseFilename) => {
    const nameWithoutExtension = baseFilename.split('.').slice(0, -1).join('.');
    const downloadFilename = `${nameWithoutExtension}-transcript.txt`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'uploading' || status === 'transcribing') return;
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'uploading' || status === 'transcribing') return;
    setIsDraggingOver(true);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (status === 'uploading' || status === 'transcribing') return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesSelected(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isWorking = status === 'uploading' || status === 'transcribing';
  let overallFileStatusText = "";
  if (isMultiFileMode && selectedFiles && selectedFiles.length > 0 && isWorking) {
    overallFileStatusText = `Processing file ${currentFileIndex + 1} of ${selectedFiles.length}`;
  }


  // --- UI Visibility Logic ---
  const showDropZone = status === 'idle' || status === 'files_selected';
  const showTranscribeButton = selectedFiles && (status === 'files_selected' || status === 'idle');
  const showProgressArea = status === 'uploading' || status === 'transcribing';
  const showSingleFileResult = !isMultiFileMode && status === 'done' && currentTranscript;
  const showErrorArea = status === 'error';
  const showResetButton = status === 'done' || status === 'error';


  return (
    <div className="App">
      <header className="App-header">
        <h1>Video Transcriber</h1>
        <p>Upload video file(s) to get timestamped transcripts.</p>
        
        {showDropZone && (
          <div 
            className={`drop-zone ${isDraggingOver ? 'dragging-over' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              multiple 
              onChange={handleInputChange} 
              ref={fileInputRef} 
              id="fileInput" 
              style={{ display: 'none' }} 
            />
            <button 
              onClick={() => fileInputRef.current.click()}
              className="select-button"
            >
              Select File(s)
            </button>
            <p className="drop-zone-text">or drag and drop files here</p>
          </div>
        )}

        {showTranscribeButton && !isWorking && (
          <button onClick={handleStartProcessing} className="transcribe-button">
            Transcribe Selected
          </button>
        )}
        
        {isWorking && ( // Show "Working..." text on main button if processing
             <button className="transcribe-button" disabled>Working...</button>
        )}


        {showProgressArea && (
          <div className="status-container">
            {isMultiFileMode && <p><strong>{overallFileStatusText}</strong></p>}
            <p>{statusMessage}</p> 
            <progress value={progress} max="100"></progress>
            {displayedETA > 0 && 
                <p><small>~{formatEta(displayedETA)} remaining for current file ({originalFilenames[currentFileIndex]})</small></p>
            }
          </div>
        )}

        {showSingleFileResult && (
            <div className="transcript-container">
                <div className="transcript-header">
                  <h2>Transcript</h2>
                  <button 
                    onClick={() => handleDownload(currentTranscript, originalFilenames[0] || "transcript.txt")} 
                    className="download-btn">
                    Download .txt
                  </button>
                </div>
                <pre className="transcript-content">{currentTranscript}</pre>
            </div>
        )}

         {showErrorArea && (
            <div className="transcript-container">
                <h2>Error</h2>
                <pre className="transcript-content error-content">{currentTranscript || statusMessage}</pre>
            </div>
        )}

        {showResetButton && (
             <button onClick={resetToInitialState} className="transcribe-button reset-button">
                Transcribe More Files
            </button>
        )}
      </header>
    </div>
  );
}

export default App;