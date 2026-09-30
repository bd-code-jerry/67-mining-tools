from backend.app.config import APP_HOST, APP_PORT

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=APP_HOST,
        port=APP_PORT,
        reload=False,
        access_log=True,
    )
