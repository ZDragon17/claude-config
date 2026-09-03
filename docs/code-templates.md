# Spring Boot 代码模板库

## Controller 模板

```java
/**
 * {功能}控制器
 */
@RestController
@RequestMapping("/api/{module}")
@RequiredArgsConstructor
@Slf4j
public class {Name}Controller {

    private final {Name}Service service;

    /**
     * 查询列表
     */
    @GetMapping
    public R<List<{Name}Vo>> list({Name}Bo bo) {
        List<{Name}Vo> list = service.queryList(bo);
        return R.ok(list);
    }

    /**
     * 查询详情
     */
    @GetMapping("/{id}")
    public R<{Name}Vo> getById(@PathVariable Long id) {
        {Name}Vo vo = service.queryById(id);
        return R.ok(vo);
    }

    /**
     * 新增
     */
    @PostMapping
    public R<Void> add(@Validated @RequestBody {Name}Bo bo) {
        service.add(bo);
        return R.ok();
    }

    /**
     * 修改
     */
    @PutMapping
    public R<Void> edit(@Validated @RequestBody {Name}Bo bo) {
        service.edit(bo);
        return R.ok();
    }

    /**
     * 删除
     */
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable Long[] ids) {
        service.removeByIds(Arrays.asList(ids));
        return R.ok();
    }
}
```

## Service 模板

```java
/**
 * {功能}服务实现
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class {Name}ServiceImpl implements {Name}Service {

    private final {Name}Mapper mapper;

    @Override
    public List<{Name}Vo> queryList({Name}Bo bo) {
        LambdaQueryWrapper<{Name}> wrapper = buildQueryWrapper(bo);
        List<{Name}> list = mapper.selectList(wrapper);
        return BeanUtil.copyToList(list, {Name}Vo.class);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void add({Name}Bo bo) {
        {Name} entity = BeanUtil.toBean(bo, {Name}.class);
        mapper.insert(entity);
    }

    private LambdaQueryWrapper<{Name}> buildQueryWrapper({Name}Bo bo) {
        return Wrappers.lambdaQuery({Name}.class)
            .eq(StringUtils.isNotBlank(bo.getField()), {Name}::getField, bo.getField())
            .orderByDesc({Name}::getCreateTime);
    }
}
```

## 全局异常处理器

```java
/**
 * 全局异常处理器
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /**
     * 业务异常
     */
    @ExceptionHandler(ServiceException.class)
    public R<Void> handleServiceException(ServiceException e) {
        log.error("业务异常：{}", e.getMessage());
        return R.fail(e.getCode(), e.getMessage());
    }

    /**
     * 参数校验异常
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public R<Void> handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldError().getDefaultMessage();
        log.error("参数校验失败：{}", message);
        return R.fail(message);
    }

    /**
     * 系统异常
     */
    @ExceptionHandler(Exception.class)
    public R<Void> handleException(Exception e) {
        log.error("系统异常", e);
        return R.fail("系统异常，请联系管理员");
    }
}
```

## MyBatis Mapper 模板

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.xxx.mapper.{Name}Mapper">

    <resultMap id="BaseResultMap" type="com.xxx.domain.{Name}">
        <id column="id" property="id"/>
        <result column="field" property="field"/>
        <result column="create_time" property="createTime"/>
    </resultMap>

    <select id="selectCustom" resultMap="BaseResultMap">
        SELECT t.*
        FROM {table_name} t
        WHERE t.del_flag = '0'
        <if test="field != null and field != ''">
            AND t.field = #{field}
        </if>
        ORDER BY t.create_time DESC
    </select>

</mapper>
```
