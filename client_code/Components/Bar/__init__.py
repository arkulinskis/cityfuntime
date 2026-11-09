from anvil import *

from ._anvil_designer import BarTemplate


class Bar(BarTemplate):
    """A progress bar: value 0-100, tone "", "gold", "pink" or "mint" (classes cf-bar.<tone> in app.css)."""

    def __init__(self, **properties):
        self._value, self._tone, self._ready = 0, "", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if not self._ready:
            return
        v = max(0, min(100, self._value or 0))
        self.dom_nodes["fill"].style.width = "%s%%" % round(v, 1)
        self.dom_nodes["bar"].className = "cf-bar " + (self._tone or "")

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, v):
        self._value = float(v or 0)
        self._draw()

    @property
    def tone(self):
        return self._tone

    @tone.setter
    def tone(self, v):
        self._tone = v or ""
        self._draw()
