import os
import whisper
import tempfile
import subprocess
import io
import numpy as np
import time
from pydub import AudioSegment

# --- HELPER FUNCTIONS ---

def split_audio_by_time(audio_segment, chunk_length_s=600):
    """
    Splits an in-memory AudioSegment into chunks of a fixed length.
    This guarantees no time is lost and timestamps remain accurate.
    """
    print(f"Splitting audio into {chunk_length_s}-second chunks...")
    chunks = []
    chunk_length_ms = chunk_length_s * 1000
    for i in range(0, len(audio_segment), chunk_length_ms):
        chunks.append(audio_segment[i:i + chunk_length_ms])
    print(f"Audio split into {len(chunks)} chunks.")
    return chunks

def combine_segments_by_sentence(segments, max_paragraph_length=30):
    """
    Combines segments from a single chunk into paragraphs that end on a 
    sentence boundary.
    """
    combined = []
    current_segment = None
    sentence_enders = ".?!"
    for segment in segments:
        if current_segment is None:
            current_segment = segment.copy()
        else:
            current_segment['end'] = segment['end']
            current_segment['text'] += " " + segment['text']
            if (current_segment['end'] - current_segment['start']) >= max_paragraph_length and current_segment['text'].strip().endswith(tuple(sentence_enders)):
                combined.append(current_segment)
                current_segment = None
    if current_segment is not None:
        combined.append(current_segment)
    return combined

# --- MAIN SERVICE FUNCTION ---

def process_video_and_emit_progress(socketio, video_path):
    main_audio_path = None
    try:
        # 1. Extract audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_f:
            main_audio_path = temp_f.name
        command = [
            'ffmpeg', '-y', '-i', video_path,
            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            main_audio_path
        ]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 2. Load audio into memory and delete temp file
        with open(main_audio_path, 'rb') as f:
            audio_buffer = io.BytesIO(f.read())
        os.remove(main_audio_path)
        main_audio_path = None
        audio_segment = AudioSegment.from_file(audio_buffer, format="wav")
        
        # 3. Use the accurate time-based chunking
        audio_chunks = split_audio_by_time(audio_segment)
        
        # 4. Transcribe each chunk
        model = whisper.load_model("small.en")
        full_transcript = ""
        cumulative_duration = 0
        prompt = ""
        start_time = time.time()

        for i, chunk in enumerate(audio_chunks):
            progress = int(100 * (i / len(audio_chunks)))
            time_elapsed = time.time() - start_time
            time_per_chunk = time_elapsed / (i + 1) if i > 0 else time_elapsed
            chunks_remaining = len(audio_chunks) - (i + 1)
            eta = int(time_per_chunk * chunks_remaining)
            status_msg = f"Transcribing chunk {i + 1}/{len(audio_chunks)}"
            socketio.emit('progress_update', {'status': status_msg, 'progress': progress, 'eta': f"{eta}s remaining"})

            raw_data = chunk.raw_data
            audio_np = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
            result = model.transcribe(audio_np, prompt=prompt)

            if not result['segments']: continue
            prompt = result['text'][-50:]
            paragraphs = combine_segments_by_sentence(result["segments"])
            
            for segment in paragraphs:
                start = segment['start'] + cumulative_duration
                end = segment['end'] + cumulative_duration
                text = segment['text']
                start_str = f"{int(start // 3600):02d}:{int((start % 3600) // 60):02d}:{int(start % 60):02d}"
                end_str = f"{int(end // 3600):02d}:{int((end % 3600) // 60):02d}:{int(end % 60):02d}"
                full_transcript += f"[{start_str} -> {end_str}]\n{text.strip()}\n\n"
            
            # This calculation is now accurate because no time is discarded
            cumulative_duration += len(chunk) / 1000

        socketio.emit('transcription_complete', {'transcript': full_transcript.strip()})

    except Exception as e:
        print(f"An unexpected error occurred: {e}") 
        socketio.emit('transcription_error', {'error': 'An unexpected error occurred during transcription.'})
    finally:
        print("Cleaning up temporary files...")
        if main_audio_path and os.path.exists(main_audio_path):
            os.remove(main_audio_path)
        if video_path and os.path.exists(video_path):
            os.remove(video_path)