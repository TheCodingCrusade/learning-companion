import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

// Use the production URL from the environment variable,
// but fall back to the local URL for development.
const URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";
const socket = io(URL, {
    transports: ["websocket", "polling"],
    timeout: 20000
});

function App() {
  const [view, setView] = useState('transcriber'); // 'transcriber' or 'summary'
  const [manualTranscript, setManualTranscript] = useState('');

  const [selectedFiles, setSelectedFiles] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'files_selected', 'uploading', 'transcribing', 'done', 'summarising', 'summary_done', 'error'
  const [progress, setProgress] = useState(0);
  const [currentFileETA, setCurrentFileETA] = useState(0);
  const [displayedETA, setDisplayedETA] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Select video file(s) or drag and drop here.');
  const [isMultiFileMode, setIsMultiFileMode] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [originalFilenames, setOriginalFilenames] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [slidesFile, setSlidesFile] = useState(null);
  const [slidesFilePathOnServer, setSlidesFilePathOnServer] = useState(null);
  const [summary, setSummary] = useState('');

  const processingFileRef = useRef(false);
  const etaIntervalRef = useRef(null);
  const fileInputRef = useRef(null);
  const slidesInputRef = useRef(null);

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

  const handleDownload = useCallback((content, baseFilename, suffix = '-transcript.txt') => {
    const nameWithoutExtension = baseFilename.split('.').slice(0, -1).join('.');
    const downloadFilename = `${nameWithoutExtension}${suffix}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    socket.on('progress_update', (data) => {
      if(status === 'summarising') return; 
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
        handleDownload(data.transcript, originalName, '-transcript.txt');
        processingFileRef.current = false;
        const nextIndex = currentFileIndex + 1;
        if (nextIndex < selectedFiles.length) {
          setCurrentFileIndex(nextIndex);
          setCurrentFileETA(0);
        } else {
          setStatus('done');
          setProgress(100);
          setStatusMessage(`All ${selectedFiles.length} files processed successfully!`);
          // Prevent further processing
          processingFileRef.current = true;
        }
      } else {
        setCurrentTranscript(data.transcript);
        setStatus('done');
        setProgress(100);
        setStatusMessage('Transcription successful! You can now generate a summary.');
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

    socket.on('summary_complete', (data) => {
        setSummary(data.summary);
        setStatus('summary_done');
        setProgress(100);
        setStatusMessage('Summary generated successfully!');
    });
    socket.on('summary_error', (data) => {
        setStatus('error');
        setProgress(0);
        setStatusMessage(`Summary Error: ${data.error}`);
    });

    return () => {
      socket.off('progress_update');
      socket.off('transcription_complete');
      socket.off('transcription_error');
      clearInterval(etaIntervalRef.current);
    };
  }, [isMultiFileMode, currentFileIndex, selectedFiles, originalFilenames, status, handleDownload]);

  const processFile = useCallback(async (fileToProcess) => {
    if (!fileToProcess || processingFileRef.current) return;

    processingFileRef.current = true;
    const formData = new FormData();
    formData.append('file', fileToProcess);

    const currentFileNameForUpload = originalFilenames[currentFileIndex] || fileToProcess.name;
    let overallProgressText = '';
    if (isMultiFileMode && selectedFiles) {
        overallProgressText = `(File ${currentFileIndex + 1} of ${selectedFiles.length}: ${currentFileNameForUpload}) `;
    }

    setStatus('uploading');
    setProgress(5);
    setStatusMessage(`${overallProgressText}Uploading file...`);
    setCurrentFileETA(0);

    try {
      const uploadResponse = await fetch(`${URL}/upload`, {
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
      setStatus('error');
      setStatusMessage(`Error processing ${currentFileNameForUpload}: ${error.message}`);
      setProgress(0);
      processingFileRef.current = false;
    }
  }, [isMultiFileMode, currentFileIndex, originalFilenames, selectedFiles]);

    useEffect(() => {
    if (isMultiFileMode && selectedFiles && currentFileIndex < selectedFiles.length &&
      status !== 'idle' && status !== 'files_selected' &&
      !processingFileRef.current) {
      processFile(selectedFiles[currentFileIndex]);
    }
  }, [currentFileIndex, isMultiFileMode, selectedFiles, status, processFile]);

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
    setSlidesFile(null);
    setSummary('');
    processingFileRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (slidesInputRef.current) slidesInputRef.current.value = "";
  };

  const handleFilesSelected = (files) => {
    if (files && files.length > 0) {
      resetToInitialState();
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
      setStatus('files_selected');
    }
  };

  const handleInputChange = (event) => {
    handleFilesSelected(event.target.files);
  };
  
  const handleStartProcessing = () => {
    // Temporary debugging lines
    console.log("--- DEBUG: 'Transcribe Selected' button was clicked ---");
    console.log("Current status is:", status);
    console.log("Is a file already processing? (processingFileRef.current):", processingFileRef.current);
    console.log("Number of selected files:", selectedFiles ? selectedFiles.length : 0);
    
    if(!selectedFiles || selectedFiles.length === 0) {
      alert('Please select file(s) first!');
      return;
    }

    if (selectedFiles.length > 1) {
      setIsMultiFileMode(true);
    } else {
      setIsMultiFileMode(false);
    }
    processFile(selectedFiles[0]);
  };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); if (status === 'uploading' || status === 'transcribing') return; setIsDraggingOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (status === 'uploading' || status === 'transcribing') return; setIsDraggingOver(true); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); if (status === 'uploading' || status === 'transcribing') return; const files = e.dataTransfer.files; if (files && files.length > 0) { handleFilesSelected(files); if (fileInputRef.current) fileInputRef.current.value = ""; } };

  const handleSlidesFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSlidesFile(file); // Keep the file object to show the user's selection
    setStatusMessage('Uploading slides...');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await fetch(`${URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Slides upload failed.');
      }

      const uploadData = await uploadResponse.json();
      // NEW: Save the path from the server
      setSlidesFilePathOnServer(uploadData.video_path); 
      setStatusMessage('Slides uploaded. Ready to generate summary.');

    } catch (error) {
      setStatus('error');
      setStatusMessage(`Error uploading slides: ${error.message}`);
    }
  };

  const triggerDocxDownload = async (transcript, slidesPath, baseFilename) => {
    setStatus('summarising');
    setStatusMessage('Generating AI summary... This may take a moment.');

    try {
      const response = await fetch(`${URL}/download-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript,
          slides_path: slidesPath,
          filename: baseFilename
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to download summary.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = baseFilename.split('.').slice(0, -1).join('.');
      a.href = url;
      a.download = `${filename}-summary.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      setStatus('summary_done');
      setStatusMessage('Summary has been downloaded successfully!');
      // After success, you might want to reset the inputs in the summary-only view
      // setManualTranscript(''); 
      // setSlidesFile(null);
      // setSlidesFilePathOnServer(null);

    } catch (error) {
      console.error('Summary generation failed:', error);
      setStatus('error');
      setStatusMessage(`Error: ${error.message}`);
    }
  };

  const handleStartSummary = async () => {
    if (!slidesFilePathOnServer || !currentTranscript) {
        setStatusMessage('Please make sure you have a transcript and have selected slides.');
        setStatus('error');
        return;
    }
    // Call the new helper function
    triggerDocxDownload(currentTranscript, slidesFilePathOnServer, originalFilenames[0] || 'video');
  };

  const handleGenerateFromText = () => {
    if (!slidesFilePathOnServer || !manualTranscript) {
      setStatusMessage('Please paste a transcript and upload the corresponding slides PDF.');
      setStatus('error');
      return;
    }
    // Call the helper function with the manual transcript and the slide's filename
    triggerDocxDownload(manualTranscript, slidesFilePathOnServer, slidesFile.name || 'custom');
  };

  const isWorking = ['uploading', 'transcribing', 'summarising'].includes(status);
  let overallFileStatusText = "";
  if (isMultiFileMode && selectedFiles && selectedFiles.length > 0 && isWorking) {
    overallFileStatusText = `Overall: Processing file ${currentFileIndex + 1} of ${selectedFiles.length}`;
  }

  const showDropZone = status === 'idle' || status === 'files_selected';
  const showTranscribeButton = selectedFiles && (status === 'files_selected' || status === 'idle');
  const showProgressArea = isWorking;
  const showResultArea = ['done', 'summary_done'].includes(status) && !isMultiFileMode && currentTranscript;
  const showErrorArea = status === 'error';
  const showResetButton = ['done', 'summary_done', 'error'].includes(status);


  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Study Assistant</h1>

        {/* --- NEW NAVIGATION --- */}
        <nav className="view-navigation">
          <button 
            onClick={() => setView('transcriber')} 
            className={view === 'transcriber' ? 'active' : ''}
          >
            Video Transcriber
          </button>
          <button 
            onClick={() => setView('summary')}
            className={view === 'summary' ? 'active' : ''}
          >
            Summary Only
          </button>
        </nav>

        {/* --- VIEW 1: VIDEO TRANSCRIBER --- */}
        {view === 'transcriber' && (
          <>
        
          {showDropZone && (
            <>
              <p>Upload video file(s) to get timestamped transcripts.</p>
              <div 
                className={`drop-zone ${isDraggingOver ? 'dragging-over' : ''}`}
                onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              >
                <input type="file" multiple onChange={handleInputChange} ref={fileInputRef} id="fileInput" style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current.click()} className="select-button">Select Video(s)</button>
                <p className="drop-zone-text">or drag and drop files here</p>
              </div>
            </>
          )}

          {showTranscribeButton && !isWorking && (
            <button onClick={handleStartProcessing} className="transcribe-button">Transcribe Selected</button>
          )}
          
          {isWorking && (
              <button className="transcribe-button" disabled>Working...</button>
          )}

          {showProgressArea && (
            <div className="status-container">
              {isMultiFileMode && <p><strong>{overallFileStatusText}</strong></p>}
              <p>{statusMessage}</p> 
              <progress value={progress} max="100"></progress>
              {status === 'transcribing' && (
                displayedETA > 0 ? (
                  <p><small>~{formatEta(displayedETA)} remaining for current file ({originalFilenames[currentFileIndex]})</small></p>
                ) : (
                  <p><small>Almost finished...</small></p>
                )
              )}
            </div>
          )}
          
          {showResultArea && (
              <div className="transcript-container">
                  <div className="transcript-header">
                    <h2>Results</h2>
                  </div>
                  
                  <div className="result-section">
                      <h3>Transcript</h3>
                      <pre className="transcript-content">{currentTranscript}</pre>
                      <button onClick={() => handleDownload(currentTranscript, originalFilenames[0] || "transcript", '-transcript.txt')} className="download-btn">Download Transcript</button>
                  </div>
                  
                  <div className="summariser-section">
                      <h3>Generate Summary</h3>
                      <p className="drop-zone-text">Upload the corresponding lecture slides (PDF) to generate a summary.</p>
                      <input type="file" accept=".pdf" onChange={handleSlidesFileChange} ref={slidesInputRef} disabled={isWorking}/>
                      <button onClick={handleStartSummary} disabled={!slidesFile || isWorking}>Generate Summary</button>
                  </div>
              </div>
          )}

          {showErrorArea && (
              <div className="transcript-container">
                  <h2>Error</h2>
                  <pre className="transcript-content error-content">{statusMessage}</pre>
              </div>
          )}

          {showResetButton && (
              <button onClick={resetToInitialState} className="transcribe-button reset-button">
                  Start Over
              </button>
          )}

        </>
        )}

        {/* --- VIEW 2: SUMMARY ONLY --- */}
        {view === 'summary' && (
          <div className="summary-only-container">
            <h2>Generate a Summary from Text</h2>
            <p>Paste your transcript, upload the lecture slides, and get a formatted summary.</p>
            
            <div className="summariser-section">
              <h3>1. Paste Transcript</h3>
              <textarea 
                className="manual-transcript-input"
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="Paste your full transcript here..."
              />
            </div>

            <div className="summariser-section">
              <h3>2. Upload Lecture Slides</h3>
              <p className="drop-zone-text">The summary will be supported by the content of these slides.</p>
              <input type="file" accept=".pdf" onChange={handleSlidesFileChange} ref={slidesInputRef}/>
              {slidesFile && <p className="file-selected-text">Selected: {slidesFile.name}</p>}
            </div>

            {/* Display status messages for this view */}
            {statusMessage && (status === 'summarising' || status === 'summary_done' || status ==='error') && (
              <div className="status-container"><p>{statusMessage}</p></div>
            )}

            <button 
              onClick={handleGenerateFromText} 
              disabled={!slidesFile || !manualTranscript || status === 'summarising'}
              className="transcribe-button"
            >
              {status === 'summarising' ? 'Generating...' : 'Generate Summary'}
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;