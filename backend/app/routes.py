from flask import Blueprint, request, jsonify, current_app
from . import socketio
from .services import process_video_and_emit_progress
from .summariser import generate_summary
import os
import tempfile

# 1. Create a Blueprint object
main_bp = Blueprint('main', __name__)

# 2. Define the HTTP route on the Blueprint
@main_bp.route('/upload', methods=['POST'])
def handle_upload():
    """Handles the file upload and saves it to a temporary location."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # Create the temp_uploads directory if it doesn't exist
        if not os.path.exists('./temp_uploads'):
            os.makedirs('./temp_uploads')

        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir='./temp_uploads') as temp_f:
            file.save(temp_f.name)
            return jsonify({'video_path': temp_f.name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 3. The Socket.IO handler remains the same, as it's attached to the imported socketio object
@socketio.on('start_transcription')
def handle_transcription_request(data):
    """
    Receives a path to an already uploaded file and starts the
    transcription process in the background.
    """
    video_path = data.get('video_path')
    if not video_path or not os.path.exists(video_path):
        socketio.emit('transcription_error', {'error': 'File not found on server.'})
        return

    print(f"Starting transcription process for file: {video_path}")
    socketio.start_background_task(
        target=process_video_and_emit_progress,
        socketio=socketio,
        video_path=video_path
    )

@socketio.on('start_summary')
def handle_summary_request(data):
    """
    Receives a transcript and a path to the slides PDF, then starts
    the summarization process.
    """
    transcript = data.get('transcript')
    slides_path = data.get('slides_path')

    if not transcript or not slides_path or not os.path.exists(slides_path):
        socketio.emit('summary_error', {'error': 'Missing transcript or slides file on server.'})
        return

    print(f"Starting summary process for slides: {slides_path}")
    
    # Emit a status update to the client
    socketio.emit('progress_update', {'status': 'Summarizing with AI...', 'progress': 0})
    
    # Generate the summary (this can take some time)
    summary = generate_summary(transcript, slides_path)

    if summary.startswith("Error:"):
         socketio.emit('summary_error', {'error': summary})
    else:
        # Send the final summary back to the client
        socketio.emit('summary_complete', {'summary': summary})