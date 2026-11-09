from anvil import *

from ._anvil_designer import ChapterTemplate
from ... import state


class Chapter(ChapterTemplate):
    """Quests page: one chapter with its missions. item = {e, title, blurb, count, pct, missions, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["e"].textContent = self.item.get("e") or ""
        state.heading(self.title, 2)
        host = self.item.get("host")
        self.missions_panel.items = [dict(m, host=host) for m in self.item.get("missions") or []]
