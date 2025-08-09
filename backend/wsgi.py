import eventlet
eventlet.monkey_patch()

import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

try:
    from app import create_app, socketio
    
    app = create_app()
    
    # Get port from environment (Render sets this) - handle empty string
    port_env = os.environ.get('PORT', '5000')
    port = int(port_env) if port_env and port_env.strip() else 5000
    
    print(f"Starting server on 0.0.0.0:{port}")
    print(f"CORS origins configured: *")
    
    # Start the server
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=port, 
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True
    )
        
except Exception as e:
    print(f"Error starting application: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
