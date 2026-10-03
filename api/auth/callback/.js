export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({
      error: "Deriv authorization failed",
      details: error
    });
  }

  if (!code) {
    return res.status(400).json({
      error: "Missing authorization code"
    });
  }

  return res.status(200).json({
    success: true,
    message: "Deriv authorization code received",
    code_received: true,
    state_received: Boolean(state)
  });
}
