from anvil import *

from ._anvil_designer import StatRowTemplate


class StatRow(StatRowTemplate):
    """Life page: one stat with its bar. item = {e, name, pct, value, tone}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["e"].textContent = self.item.get("e") or ""
        self.bar.tone = self.item.get("tone") or ""
