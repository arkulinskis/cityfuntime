from anvil import *

from ._anvil_designer import StepRowTemplate


class StepRow(StepRowTemplate):
    """Mission dialog: a step (state "done", "now" or "") or a requirement. item = {text, state}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["row"].className = "qs-step " + (self.item.get("state") or "")
