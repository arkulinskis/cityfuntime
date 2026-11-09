from anvil import *

from ._anvil_designer import ListRowTemplate


class ListRow(ListRowTemplate):
    """Life page: a friend or a business. item = {e, title, sub}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["e"].textContent = self.item.get("e") or ""
