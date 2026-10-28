// Placeholder for endpoints that are not built yet.
// Usage: router.post('/', notImplemented('TM-F-010'));
module.exports = function notImplemented(storyId) {
  return (req, res) =>
    res.status(501).json({ error: 'Not implemented yet', story: storyId });
};
