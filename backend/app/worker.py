"""Report scheduler and daily public-review collection: python -m app.worker."""
import logging
import os
import time
from .database import database, initialize
from .services import tick
from .market import tick_market


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
                market_runs = tick_market(factory)
                if market_runs:
                    logging.info('Review crawl statuses: %s', ', '.join(run['status'] for run in market_runs if run))
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
