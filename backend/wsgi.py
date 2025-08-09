import eventlet
eventlet.monkey_patch()

import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

try:
    from app import create_app, socketio
    
    app = create_app()
    
    # Get port from environment (Render sets this)
    port = int(os.environ.get('PORT', 5000))
    
    print(f"Starting server on 0.0.0.0:{port}")
    
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
