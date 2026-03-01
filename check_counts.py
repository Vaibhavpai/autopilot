import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
from app.core.database import db

async def check_data():
    collections = await db.list_collection_names()
    print("Collections:", collections)
    for col in collections:
        count = await db[col].count_documents({})
        print(f"{col}: {count}")

if __name__ == "__main__":
    asyncio.run(check_data())
