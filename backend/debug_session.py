import sqlite3

def check_session_64():
    """Check session 64 and user 15 directly in database"""
    conn = sqlite3.connect('db.sqlite3')
    cursor = conn.cursor()
    
    print("=== Checking Session 64 ===")
    try:
        cursor.execute("SELECT id, driver_id, is_active, start_time, end_time FROM patrol_api_driversession WHERE id = 64")
        session = cursor.fetchone()
        if session:
            print(f"Session 64 found:")
            print(f"  - Driver ID: {session[1]}")
            print(f"  - Is Active: {session[2]}")
            print(f"  - Start Time: {session[3]}")
            print(f"  - End Time: {session[4]}")
        else:
            print("❌ Session 64 does not exist")
    except Exception as e:
        print(f"Error checking session 64: {e}")
    
    print("\n=== Checking User 15 ===")
    try:
        cursor.execute("SELECT id, username, role FROM auth_user WHERE id = 15")
        user = cursor.fetchone()
        if user:
            print(f"User 15 found:")
            print(f"  - Username: {user[1]}")
            print(f"  - Role: {user[2]}")
            
            # Check active sessions for user 15
            cursor.execute("SELECT id, is_active, start_time, end_time FROM patrol_api_driversession WHERE driver_id = 15 AND is_active = 1")
            active_sessions = cursor.fetchall()
            print(f"  - Active sessions: {len(active_sessions)}")
            for sess in active_sessions:
                print(f"    * Session {sess[0]}: Active={sess[1]}, Start={sess[2]}, End={sess[3]}")
        else:
            print("❌ User 15 does not exist")
    except Exception as e:
        print(f"Error checking user 15: {e}")
    
    print("\n=== All Active Sessions ===")
    try:
        cursor.execute("""
            SELECT ds.id, ds.driver_id, u.username, ds.is_active, ds.start_time, ds.end_time 
            FROM patrol_api_driversession ds 
            JOIN auth_user u ON ds.driver_id = u.id 
            WHERE ds.is_active = 1
        """)
        active_sessions = cursor.fetchall()
        print(f"Total active sessions: {len(active_sessions)}")
        for sess in active_sessions:
            print(f"  - Session {sess[0]}: User {sess[2]} (ID: {sess[1]})")
    except Exception as e:
        print(f"Error checking active sessions: {e}")
    
    conn.close()

if __name__ == '__main__':
    check_session_64()
