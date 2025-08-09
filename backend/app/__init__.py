import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Create the SocketIO instance globally
socketio = SocketIO()

def create_app():
    app = Flask(__name__)
    
    # Configure CORS - permissive for all origins
    CORS(app, 
         origins=["*"],
         methods=["GET", "POST", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization"],
         supports_credentials=False)  # Set to False when using "*"
    
    # Initialize SocketIO with permissive CORS
    socketio.init_app(app, 
                      cors_allowed_origins="*",
                      async_mode='eventlet',
                      logger=True,   # Enable logging to debug
                      engineio_logger=True)

    # Add a root route
    @app.route('/')
    def index():
        return {'message': 'Learning Companion API', 'status': 'running'}, 200

    # Import and register your routes
    try:
        from .routes import main_bp
        app.register_blueprint(main_bp)
        print("Routes registered successfully")
    except ImportError as e:
        print(f"Error importing routes: {e}")
        
    return app