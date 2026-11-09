from anvil import *

from ._anvil_designer import MissionCardTemplate


class MissionCard(MissionCardTemplate):
    """Quests page: one mission (done / active / new / locked). item = {id, e, title, sub, status, label, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, n = self.item, self.dom_nodes
        n["e"].textContent = it.get("e") or ""
        n["title"].textContent = it.get("title") or ""
        n["sub"].textContent = it.get("sub") or ""
        n["badge"].textContent = it.get("label") or ""
        n["badge"].className = "qs-st " + (it.get("status") or "")
        n["card"].className = "qs-m " + (it.get("status") or "")
        n["card"].setAttribute("data-key", it.get("id") or "")

    def card_click(self, event):
        host = self.item.get("host")
        if host is not None:
            host.open_mission(self.item["id"])
