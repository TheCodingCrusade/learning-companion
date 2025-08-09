from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Simple configuration for local development
socketio = SocketIO(cors_allowed_origins="*")

def create_app():
    app = Flask(__name__)
    
    # This allows your local React app to talk to your local Flask server
    CORS(app)
    
    socketio.init_app(app)

    # Import and register your routes
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app