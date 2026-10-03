import os
import json
from pathlib import Path
import pymysql
from dotenv import load_dotenv

# Load configuration from .env or fallback to database/config.json
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"
file_config = {}
if CONFIG_PATH.exists():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        file_config = json.load(f)

DB_HOST = os.getenv("DB_HOST", file_config.get("host", "localhost"))
DB_PORT = int(os.getenv("DB_PORT", file_config.get("port", 3306)))
DB_USER = os.getenv("DB_USER", file_config.get("user", "root"))
DB_PASSWORD = os.getenv("DB_PASSWORD", file_config.get("password", ""))
DB_NAME = os.getenv("DB_NAME", file_config.get("database", "neurorush"))


def get_connection():
    """
    Returns an active PyMySQL connection to the target MySQL database.
    Does NOT use SQLite or mock engines.
    """
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def test_connection():
    """
    Verifies that queries use the live active MySQL connection.
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT DATABASE() AS current_db, VERSION() AS mysql_version, USER() AS connected_user;")
            result = cursor.fetchone()
            cursor.execute("SHOW TABLES;")
            tables = cursor.fetchall()
            return {
                "connection": "ACTIVE_MYSQL",
                "details": result,
                "tables": [list(t.values())[0] for t in tables],
            }


if __name__ == "__main__":
    res = test_connection()
    print("Database Connection Verified:")
    print(json.dumps(res, indent=2))
