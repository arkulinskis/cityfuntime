from anvil import *

from ._anvil_designer import DiaryRowTemplate


class DiaryRow(DiaryRowTemplate):
    """Life page: one diary line. item = {e, text, day}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["e"].textContent = self.item.get("e") or ""
