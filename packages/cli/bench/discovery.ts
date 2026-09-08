// Read-only HTTPS compatibility probe. Never requests or stores credentials.
const response = await fetch(
  "https://api.inth.com/.well-known/oauth-authorization-server",
  { redirect: "error" }
);
if (!response.ok) {
  throw new Error("Discovery failed.");
}
console.log(await response.text());
