import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

def create_app():
    app = Flask(__name__)
    
    # Configure CORS for Flask routes
    CORS(app, 
         origins=["https://learning-companion-chi.vercel.app", "http://localhost:3000"],
         methods=["GET", "POST", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=True)
    
    # Configure SocketIO with proper CORS settings
    socketio = SocketIO(
        app,
        cors_allowed_origins=["https://learning-companion-chi.vercel.app", "http://localhost:3000"],
        async_mode='eventlet',
        logger=False,  # Disable for production
        engineio_logger=False,  # Disable for production
        allow_upgrades=True,
        transports=['polling', 'websocket']
    )

    # Add a root route to fix the 404 error
    @app.route('/')
    def index():
        return {'message': 'Learning Companion API', 'status': 'running'}, 200

    # Import and register your routes
    try:
        from .routes import main_bp
        app.register_blueprint(main_bp)
    except ImportError as e:
        print(f"Error importing routes: {e}")
        
    return app, socketio

# Create the global socketio instance
app, socketio = create_app()