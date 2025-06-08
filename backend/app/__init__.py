from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Initialize extensions outside the factory
socketio = SocketIO(cors_allowed_origins="*")

def create_app():
    app = Flask(__name__)
    CORS(app)

    # Initialize Socket.IO with the app
    socketio.init_app(app)

    # --- FIX ---
    # Import and register the Blueprint after the app is created
    from .routes import main_bp
    app.register_blueprint(main_bp)
    # -----------

    return app