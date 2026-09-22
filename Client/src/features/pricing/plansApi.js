import api from '../../lib/axios';

// Public plans feed for the pricing landing page. Uses the _silent flag so a
// failed probe never triggers the hard redirect to /login.
export function listPublicPlans() {
  return api.get('/public/plans', { _silent: true }).then((r) => r.data.data);
}
