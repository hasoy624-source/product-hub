"""Daily review scheduler for the persistent native project database."""
import logging
import os
from pathlib import Path
import time
from .database import database,initialize
from .market import tick_market


def main():
    root=Path(__file__).resolve().parents[1]
    url=os.getenv('PROJECT_DATABASE_URL') or os.getenv('DATABASE_URL') or 'sqlite:///'+(root/'project-workspace.db').as_posix()
    engine,factory=database(url);initialize(engine)
    logging.basicConfig(level=logging.INFO)
    try:
        while True:
            try:
                for run in tick_market(factory):
                    if run:logging.info('Review crawl: %s',run['status'])
            except Exception:logging.exception('Review scheduler failed')
            time.sleep(max(10,float(os.getenv('MARKET_POLL_SECONDS','30'))))
    except KeyboardInterrupt:pass
    finally:engine.dispose()


if __name__=='__main__':main()
