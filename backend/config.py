import os

from dotenv import load_dotenv

load_dotenv()

AVIATIONSTACK_API_KEY = os.getenv("AVIATIONSTACK_API_KEY", "").strip()

USER_AGENT = "flight-database-hobby-project/1.0 (personal, non-commercial use)"
