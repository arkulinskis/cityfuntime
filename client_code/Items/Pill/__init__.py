from anvil import *

from ._anvil_designer import PillTemplate


class Pill(PillTemplate):
    """A sticker pill: item = {text, tone} (tone "", gold, grape or pink)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["pill"].textContent = self.item.get("text") or ""
        self.dom_nodes["pill"].className = "cf-pill " + (self.item.get("tone") or "")
