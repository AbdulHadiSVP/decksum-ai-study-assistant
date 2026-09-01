import sqlite3
import datetime
import traceback

def get_db():
    conn = sqlite3.connect("database.db")
    conn.row_factory = sqlite3.Row
    return conn

try:
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. studyByDay
    print("Testing studyByDay...")
    today = datetime.date.today()
    last_7_days = [today - datetime.timedelta(days=i) for i in range(6, -1, -1)]
    
    study_by_day = []
    for day in last_7_days:
        day_str = day.strftime("%Y-%m-%d")
        cursor.execute("SELECT SUM(minutes) FROM study_time WHERE date = ?", (day_str,))
        row = cursor.fetchone()
        minutes = row[0] if (row and row[0] is not None) else 0
        study_by_day.append({"date": day_str, "minutes": minutes})
    print("studyByDay: success")

    # 2. quizAccuracy
    print("Testing quizAccuracy...")
    cursor.execute("""
        SELECT doc_name, AVG(accuracy) as avg_acc, COUNT(*) as cnt
        FROM quiz_history
        GROUP BY doc_id, doc_name
    """)
    quiz_accuracy_rows = cursor.fetchall()
    quiz_accuracy = []
    for r in quiz_accuracy_rows:
        quiz_accuracy.append({
            "docName": r["doc_name"],
            "avgAccuracy": round(r["avg_acc"], 1),
            "count": r["cnt"]
        })
    print("quizAccuracy: success")

    # 3. cardBreakdown
    print("Testing cardBreakdown...")
    cursor.execute("SELECT COUNT(*) FROM flashcards WHERE ease_factor >= 2.8")
    easy_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM flashcards WHERE ease_factor >= 2.0 AND ease_factor < 2.8")
    medium_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM flashcards WHERE ease_factor < 2.0")
    hard_count = cursor.fetchone()[0]
    
    card_breakdown = {
        "easy": easy_count,
        "medium": medium_count,
        "hard": hard_count
    }
    print("cardBreakdown: success")

    # 4. topScholars
    print("Testing topScholars...")
    start_date = (today - datetime.timedelta(days=6)).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT u.username, SUM(s.minutes) as total_min
        FROM study_time s
        JOIN users u ON s.user_id = u.id
        WHERE s.date >= ?
        GROUP BY s.user_id
        ORDER BY total_min DESC
        LIMIT 5
    """, (start_date,))
    scholar_rows = cursor.fetchall()
    top_scholars = []
    for r in scholar_rows:
        top_scholars.append({
            "username": r["username"],
            "totalMinutes": r["total_min"]
        })
    print("topScholars: success")

except Exception as e:
    traceback.print_exc()
finally:
    if 'conn' in locals():
        conn.close()
