export default function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Deriv authorization failed: ${error}`);
  }

  if (!code) {
    return res.status(400).send("No authorization code received.");
  }

  res.status(200).send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h2>Trader Pro</h2>
        <p>Deriv authorization received.</p>
        <p>You can return to Trader Pro.</p>
      </body>
    </html>
  `);
}
