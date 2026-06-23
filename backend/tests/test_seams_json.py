"""P1 测试：三接缝接口可导入/可用 + JSON 安全解析容错。"""
from app import seams
from app.safe_json import dumps_safe, loads_or


def test_seams_importable_and_principal():
    p = seams.get_current_principal()
    assert p.id == "local"
    assert p.is_admin is True
    # 抽象类不可实例化、Protocol 存在
    assert hasattr(seams, "StorageBackend")
    assert hasattr(seams, "RetrievalEngine")
    assert seams.RetrievalResult(document_id=1, title="t", snippet="s", score=1.0, engine="fts5")


def test_loads_or_handles_garbage():
    assert loads_or(None, []) == []
    assert loads_or("", {}) == {}
    assert loads_or("not json{", []) == []
    assert loads_or('[1,2,3]', []) == [1, 2, 3]
    assert loads_or('{"a":1}', {}) == {"a": 1}
    # 已是结构体则原样返回
    assert loads_or({"x": 1}, {}) == {"x": 1}


def test_dumps_safe():
    assert dumps_safe([1, 2]) == "[1, 2]"
    assert dumps_safe({"中": "文"}) == '{"中": "文"}'
    # 不可序列化对象回退默认
    assert dumps_safe({1, 2, 3}) == "[]"
