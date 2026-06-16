import psycopg2
conn = psycopg2.connect('postgresql://postgres.widgcpsntyrzrxalhifa:TheBigBannaBoy123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
cur.execute("SELECT table_name, column_name FROM information_schema.columns WHERE table_name LIKE 'participant_teams%'")
for row in cur.fetchall():
    print(row)
