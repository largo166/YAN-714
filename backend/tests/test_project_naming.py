"""块2 名字守卫 B 的回归守卫(2026-07-07)。纯函数,不碰 DB。"""
from app.project_naming import reject_as_project, warn_as_project


class TestReject:
    def test_repo_root_itself_rejected(self):
        assert reject_as_project(r"C:\仓库-00", repo_root=r"C:\仓库-00") is not None
        # 大小写/斜杠归一后仍命中
        assert reject_as_project(r"c:\仓库-00", repo_root=r"C:\仓库-00\\") is not None

    def test_drive_root_rejected(self):
        assert reject_as_project(r"C:\\") is not None
        assert reject_as_project("D:\\") is not None

    def test_system_dirs_rejected(self):
        for p in (r"C:\Users\yz\Desktop", r"C:\Users\yz\Downloads", r"C:\Users", r"D:\桌面"):
            assert reject_as_project(p) is not None, p

    def test_real_project_dir_passes(self):
        # 真实项目目录:不该被拒
        assert reject_as_project(r"C:\yan-项目数据\石家庄市庄项目", repo_root=r"C:\仓库-00") is None
        assert reject_as_project(r"C:\襄阳\星河国际基础资料") is None

    def test_project_under_repo_passes(self):
        # 仓库根「下面」的项目目录不该被拒(只拒根本身)
        assert reject_as_project(r"C:\仓库-00\某项目", repo_root=r"C:\仓库-00") is None


class TestWarn:
    def test_number_prefix_warned(self):
        for n in ("01_项目资料", "02-方案", "1.总图", "003 素材"):
            assert warn_as_project(n) is not None, n

    def test_generic_names_warned(self):
        for n in ("项目资料", "基础资料", "资料", "新建文件夹", "data", "temp"):
            assert warn_as_project(n) is not None, n

    def test_real_project_names_pass(self):
        # 真项目名(哪怕含数字/编号但不是纯前缀)不该被警示
        for n in ("石家庄市庄项目", "哈尔滨中艺项目", "20260318-00-哈尔滨", "襄阳资料", "星河国际项目"):
            assert warn_as_project(n) is None, n

    def test_empty_name_no_warn(self):
        assert warn_as_project("") is None
        assert warn_as_project("   ") is None
