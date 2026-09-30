from ..database import utc_now_iso

PROVIDERS = [
    ("openrouter", "OpenRouter", "USD", 10),
    ("parallel", "Parallel", "USD", 20),
    ("firecrawl", "Firecrawl", "credits", 30),
    ("exa", "Exa", "USD", 40),
    ("tavily", "Tavily", "credits", 50),
    ("chutes", "Chutes", "t", 60),
    ("desearch", "desearch", "USD", 70),
    ("vercel_gateway", "Vercel(GateWay)", "USD", 80),
]

# The user's existing history. The "used" value is treated as usage for that saved entry,
# and the "left" value is the remaining balance after that entry.
SEED_HISTORY = [
    ("2026-09-18", {
        "openrouter": (0, 10), "parallel": (0, 25), "firecrawl": (0, 1400),
        "exa": (0, 20), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-19", {
        "openrouter": (1.82, 8.18), "parallel": (1.29, 23.71), "firecrawl": (1, 1399),
        "exa": (0, 20), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-20", {
        "openrouter": (3.08, 5.10), "parallel": (3.38, 20.33), "firecrawl": (4, 1395),
        "exa": (0, 20), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-21", {
        "openrouter": (2.29, 2.82), "parallel": (2.09, 18.24), "firecrawl": (2, 1393),
        "exa": (0, 20), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-22", {
        "openrouter": (2.16, 30.66), "parallel": (2.40, 15.84), "firecrawl": (8, 1385),
        "exa": (0.01, 19.99), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-23", {
        "openrouter": (8.16, 22.50), "parallel": (5.06, 10.78), "firecrawl": (3, 1382),
        "exa": (0.01, 19.98), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-24", {
        "openrouter": (5.78, 35.71), "parallel": (4.50, 35.28), "firecrawl": (11, 1371),
        "exa": (0, 19.98), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
    ("2026-09-25", {
        "openrouter": (14.01, 21.72), "parallel": (6.56, 28.72), "firecrawl": (18, 1353),
        "exa": (0.01, 19.97), "tavily": (0, 1000), "chutes": (0, 0.00473),
        "desearch": (0, 5.25), "vercel_gateway": (0, 5),
    }),
]


def seed_defaults(conn) -> None:
    for provider_key, display_name, unit, sort_order in PROVIDERS:
        conn.execute(
            """
            INSERT INTO providers(provider_key, display_name, unit, sort_order)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(provider_key) DO UPDATE SET
                display_name = excluded.display_name,
                unit = excluded.unit,
                sort_order = excluded.sort_order
            """,
            (provider_key, display_name, unit, sort_order),
        )

    count = conn.execute("SELECT COUNT(*) AS c FROM history_entries").fetchone()["c"]
    if count:
        return

    provider_rows = conn.execute("SELECT id, provider_key FROM providers").fetchall()
    provider_ids = {row["provider_key"]: row["id"] for row in provider_rows}
    now = utc_now_iso()

    for entry_date, values in SEED_HISTORY:
        cursor = conn.execute(
            """
            INSERT INTO history_entries(entry_date, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, NULL, NULL)
            """,
            (entry_date, now, now),
        )
        entry_id = cursor.lastrowid
        for provider_key, (used, left) in values.items():
            total = float(used) + float(left)
            conn.execute(
                """
                INSERT INTO history_values(entry_id, provider_id, total_balance, used_balance, left_balance)
                VALUES (?, ?, ?, ?, ?)
                """,
                (entry_id, provider_ids[provider_key], total, float(used), float(left)),
            )
