from flask import Blueprint, request, jsonify
from . import socketio
from .services import process_video_and_emit_progress
import os
import tempfile

main_bp = Blueprint('main', __name__)

# This is the health check route for UptimeRobot
@main_bp.route('/health')
def health_check():
    """A simple route to check if the server is alive."""
    return "OK", 200

@main_bp.route('/upload', methods=['POST'])
def handle_upload():
    """Handles the file upload and saves it to a temporary location."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        temp_dir = tempfile.mkdtemp()
        suffix = os.path.splitext(file.filename)[1]
        temp_f_path = os.path.join(temp_dir, f"upload{suffix}")
        file.save(temp_f_path)
        return jsonify({'video_path': temp_f_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

    # This ensures the long-running task does not block the server
    socketio.start_background_task(
        target=process_video_and_emit_progress,
        socketio=socketio,
        video_path=video_path
    )