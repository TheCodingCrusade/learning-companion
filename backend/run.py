from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    # This command starts the development server with full WebSocket support
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)