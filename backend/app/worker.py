"""Run separately from API: python -m app.worker. Never calls external APIs."""
import logging
import os
import time
from .database import database, initialize
from .services import tick


def main():
    from .main import settings
    settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    engine, factory = database()
    initialize(engine)
    delay = max(1, float(os.getenv("WORKER_POLL_SECONDS", "30")))
    logging.info("Database scheduler started; poll interval %s seconds", delay)
    try:
        while True:
            try:
                runs = tick(factory)
                if runs:
                    logging.info("Processed run IDs: %s", ", ".join(runs))
            except Exception:
                logging.exception("Scheduler polling failed; retrying after interval")
            time.sleep(delay)
    except KeyboardInterrupt:
        logging.info("Scheduler stopped")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
