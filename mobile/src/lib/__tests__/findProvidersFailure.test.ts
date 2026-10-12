import { ApiError } from '../api';
import { findProvidersFailureMessage } from '../findProvidersFailure';

const UNREACHABLE =
  "We couldn't reach the matching service just now. Your job is still open and providers can see it. Try again in a few minutes.";

describe('findProvidersFailureMessage', () => {
  it.each<[string, unknown, string]>([
    ['500 from the server', new ApiError('Internal server error', 500), UNREACHABLE],
    ['502 from the server', new ApiError('The server is unavailable right now (HTTP 502). Please try again shortly.', 502), UNREACHABLE],
    ['503 from the server', new ApiError('Service Unavailable', 503), UNREACHABLE],
    ['504 from the server', new ApiError('Gateway Timeout', 504), UNREACHABLE],
    ['a network failure thrown by fetch', new TypeError('Network request failed'), UNREACHABLE],
    ['a thrown value that is not an Error', 'socket hang up', UNREACHABLE],
    ['400 with the server message', new ApiError('This job is no longer looking for providers', 400), 'This job is no longer looking for providers'],
    ['400 for a job in another status', new ApiError("Cannot run recommendations for a 'assigned' job", 400), "Cannot run recommendations for a 'assigned' job"],
    ['400 with validator output', new ApiError('category_id should not be empty', 400), 'Service is required.'],
    ['400 with no message', new ApiError('', 400), 'Could not look for providers. Please try again.'],
    ['403 with the server message', new ApiError('Forbidden resource', 403), 'Forbidden resource'],
    ['404 with the server message', new ApiError('Job not found.', 404), 'Job not found.'],
    ['no connection to the server (status 0)', new ApiError('Cannot reach the server. Check your connection and try again.', 0), 'Cannot reach the server. Check your connection and try again.'],
  ])('%s', (_label, error, expected) => {
    expect(findProvidersFailureMessage(error)).toBe(expected);
  });
});
