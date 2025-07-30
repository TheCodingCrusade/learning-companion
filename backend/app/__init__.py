import re
import eventlet
eventlet.monkey_patch()

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix

# This configuration allows all Vercel subdomains
socketio = SocketIO(
    async_mode='eventlet',
    cors_allowed_origins=[
        "http://localhost:3000",
        re.compile(r"https?://(.*\.)?vercel\.app") # Use this regular expression
    ]
)

def create_app():
    app = Flask(__name__)
    CORS(app)

    # ProxyFix middleware
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Initialize Socket.IO with the app
    socketio.init_app(app)

    # Import and register the Blueprint after the app is created
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app