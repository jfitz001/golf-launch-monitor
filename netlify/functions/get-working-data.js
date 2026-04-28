// Get working data - simplified stub
export default async (req, context) => {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
