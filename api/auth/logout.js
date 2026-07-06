module.exports = function handler(req, res) {
  res.statusCode = 302;
  res.setHeader("Set-Cookie", [
    "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "oauth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "storyline_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  ]);
  res.setHeader("Location", "/");
  res.end();
};
