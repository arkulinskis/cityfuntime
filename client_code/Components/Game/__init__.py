from anvil import *

from ._anvil_designer import GameTemplate
from ... import cft, router, state


class Game(GameTemplate):
    """The 3D game in a page. The engine draws its own HUD, phone, dialogs and panels (cft-ui.js) and saves by itself
    (cft-kit.js: this browser + the server every 20 s); Python only mounts it and handles leaving."""

    def __init__(self, **properties):
        self.ctl = cft.NULL
        super().__init__(**properties)

    @handle("", "show")
    def form_show(self, **event_args):
        self.destroy()
        self.ctl = cft.mount_game(self.dom_nodes["root"], self._exit, self._reload)

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.destroy()

    def destroy(self):
        if self.ctl is not None:
            self.ctl.destroy()
            self.ctl = cft.NULL

    def _exit(self):
        router.go(router.HOME if state.me() else "landing")

    def _reload(self):
        router.show()
