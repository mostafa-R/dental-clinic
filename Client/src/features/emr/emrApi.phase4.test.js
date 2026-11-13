import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../lib/axios', () => ({ default: { post: (...args) => mocks.post(...args), delete: (...args) => mocks.delete(...args) } }));

import { emrApi } from './emrApi';

beforeEach(() => vi.clearAllMocks());

describe('emrApi attachments (Phase 4)', () => {
  it('uploads attachment with patient context and progress callback wiring', async () => {
    mocks.post.mockResolvedValueOnce({ data: { data: { file: { filename: 'x.enc', url: '/api/v1/emr/attachments/x.enc/download' } } } });
    const file = new Blob(['hi'], { type: 'text/plain' });
    const onProgress = vi.fn();
    const result = await emrApi.uploadFile(file, { patientId: 'p1', onProgress });
    expect(mocks.post).toHaveBeenCalled();
    const [url, formData, config] = mocks.post.mock.calls[0];
    expect(url).toBe('/emr/attachments/upload');
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('patient')).toBe('p1');
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(typeof config.onUploadProgress).toBe('function');
    config.onUploadProgress({ loaded: 5, total: 10 });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(result.file.filename).toBe('x.enc');
  });

  it('deletes attachment by encoded filename via existing endpoint', async () => {
    mocks.delete.mockResolvedValueOnce({ data: { data: { deleted: true } } });
    await emrApi.deleteAttachment('a b.enc');
    expect(mocks.delete).toHaveBeenCalledWith('/emr/attachments/a%20b.enc');
  });
});
