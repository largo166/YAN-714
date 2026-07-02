"""资产自动分类（P1 解冻）：强关键词才归类,无命中不猜。"""
from app.image_assets import classify_by_name


def test_strong_keywords_classify():
    assert classify_by_name("一层平面图.png") == "plan"
    assert classify_by_name("总平面布置.jpg") == "plan"
    assert classify_by_name("白模体块推敲.png") == "model"
    assert classify_by_name("石材材质贴图.jpg") == "material"
    assert classify_by_name("公司LOGO最终版.png") == "logo"
    assert classify_by_name("鸟瞰效果图-夜景.jpg") == "render"
    assert classify_by_name("竞品案例意向图.png") == "reference"


def test_no_hit_returns_empty_not_guess():
    assert classify_by_name("DJI_0729.JPG") == ""  # 无人机照片:无强信号,不猜
    assert classify_by_name("IMG_20260701_1234.jpg") == ""
    assert classify_by_name("") == ""
