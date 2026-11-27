"""What lifetime access means in THIS app (Lifetime.py is the same in every app; this file is the app's own).

    APP_NAME   shown on the offer and on the Stripe receipt
    FREE       what everyone gets (shown on the offer, so people see what they keep)
    PAID       what $34 unlocks (shown on the offer); keep each line short
    CAPS       fair-use limits for lifetime buyers per month, e.g. {"scans": 20} (check with Lifetime.within_cap)
    FREE_CAPS  the same limits for free users, e.g. {"scans": 3}
Written by tools/lifetime_rollout.py from APP_MAKER/money/lifetime/plan.json; edit freely afterwards.
"""
APP_NAME = "City Fun Time"
FREE = [
    "The whole game on your own real street",
]
# Nothing is gated yet (2026-11-27): the game has no separate city packs or cosmetics to sell. When a pack is made,
# gate it with lifetime.gate("...") / Lifetime.unlocked(user) and list it here.
PAID = [
    "Every future pack: extra cities and cosmetics",
]
CAPS = {}
FREE_CAPS = {}
