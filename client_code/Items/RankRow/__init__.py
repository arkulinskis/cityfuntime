from anvil import *

from ._anvil_designer import RankRowTemplate


class RankRow(RankRowTemplate):
    """Leaderboard: one player. item = a leaderboard entry + "value" (the number this board ranks by, formatted)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        e, n = self.item, self.dom_nodes
        rank = e.get("rank") or 0
        n["row"].className = "rk-row" + (" me" if e.get("me") else "") + (" r%d" % rank if rank in (1, 2, 3) else "")
        n["rank"].textContent = str(rank)
        n["name"].textContent = (e.get("name") or "Player") + (" (you)" if e.get("me") else "")
        sub = "Level %s · day %s" % (e.get("level") or 1, e.get("day") or 1)
        if e.get("partner"):
            sub += " · 💘"
        if e.get("kids"):
            sub += " · " + "👶" * min(3, int(e.get("kids") or 0))
        if e.get("biz"):
            sub += " · 💼 %s" % e.get("biz")
        n["sub"].textContent = sub
        n["val"].textContent = e.get("value") or ""
