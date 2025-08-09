import eventlet
eventlet.monkey_patch()

import os
from app import create_app, socketio

app = create_app()

# For Gunicorn with eventlet worker
if __name__ != "__main__":
    # This is when running under Gunicorn
    gunicorn_app = socketio
