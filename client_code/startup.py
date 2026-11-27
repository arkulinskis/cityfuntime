"""The app starts here (anvil.yaml: startup module). One server call to learn who is signed in (Anvil's loading
spinner shows meanwhile), the Privacy & Terms kit, then the page for the address in the browser bar."""
import anvil.server

from . import cft, legal, router, state
from . import session_guard

session_guard.start()  # an expired server session reloads quietly instead of "Session expired, refresh now"

LEGAL_THEME = {"accent": "#6b4eff"}  # colours for the Privacy & Terms page (match --c-brand in app.css)

legal.setup(LEGAL_THEME)
cft.setup()  # the server bridge the game engine uses (cft-kit.js)
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
from . import lifetime  # $34 lifetime gate: free until the App Secret stripe_secret_key is set
lifetime.handle_return()
router.start()
