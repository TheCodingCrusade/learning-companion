import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io('http://127.0.0.1:5000');

function App() {
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
      socket.off('summary_complete');
      socket.off('summary_error');
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

  const handleSlidesFileChange = (event) => {
    const file = event.target.files[0];
    if(file) {
      setSlidesFile(file);
    }
  };

  const handleStartSummary = async () => {
    if (!slidesFile) {
      alert('Please select a lecture slides PDF file.');
      return;
    }
    if (!currentTranscript) {
        alert('Cannot generate summary without a transcript.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', slidesFile);

    try {
        setStatus('summarising'); // New status
        setProgress(25); // Show some progress
        setStatusMessage('Uploading slides...');
        
        const uploadResponse = await fetch('http://127.0.0.1:5000/upload', {
            method: 'POST',
            body: formData,
        });
        if (!uploadResponse.ok) throw new Error('Slides upload failed.');
        
        const uploadData = await uploadResponse.json();
        const { video_path: slides_path } = uploadData;

        setStatusMessage('Slides uploaded. Generating AI summary...');
        setProgress(50);
        socket.emit('start_summary', {
            transcript: currentTranscript,
            slides_path: slides_path,
        });

    } catch (error) {
        setStatus('error');
        setStatusMessage(`Error: ${error.message}`);
    }
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
            {status === 'transcribing' && displayedETA > 0 && 
                <p><small>~{formatEta(displayedETA)} remaining for current file ({originalFilenames[currentFileIndex]})</small></p>
            }
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

                {summary && (
                    <div className="result-section">
                        <h3>AI Summary</h3>
                        <pre className="transcript-content">{summary}</pre>
                        <button onClick={() => handleDownload(summary, originalFilenames[0] || "summary", '-summary.txt')} className="download-btn">Download Summary</button>
                    </div>
                )}
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
      </header>
    </div>
  );
}

export default App;