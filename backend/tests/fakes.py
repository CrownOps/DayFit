"""Google API 클라이언트 흉내내기.

실제 Gmail/Calendar에 붙지 않고도 "요청이 몇 번 나갔는지"를 검증하기 위한
최소 구현. googleapiclient의 실제 계약을 그대로 따른다:

    batch = service.new_batch_http_request(callback=cb)
    batch.add(request, request_id="...")
    batch.execute()   # 서브요청마다 cb(request_id, response, exception)
"""


class BatchLog:
    """배치가 몇 번, 몇 개씩 나갔는지 기록한다."""

    def __init__(self):
        self.batches = 0
        self.sizes: list[int] = []
        self.requested: list[str] = []

    @property
    def http_calls(self) -> int:
        """배치는 몇 개를 담았든 HTTP 요청 1건이다."""
        return self.batches


class FakeBatch:
    def __init__(self, callback, log: BatchLog):
        self._callback = callback
        self._added: list[tuple[str, object]] = []
        self._log = log
        log.batches += 1

    def add(self, request, callback=None, request_id=None):
        if any(rid == request_id for rid, _ in self._added):
            raise KeyError(f"duplicate request_id: {request_id}")
        self._added.append((request_id, request))

    def execute(self, http=None):
        self._log.sizes.append(len(self._added))
        for request_id, response in self._added:
            # 서브요청이 예외 객체면 그 요청만 실패한 것으로 전달한다.
            if isinstance(response, Exception):
                self._callback(request_id, None, response)
            else:
                self._callback(request_id, response, None)
